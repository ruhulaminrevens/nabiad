import unittest
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID

from xml.etree.ElementTree import SubElement, fromstring, tostring

from collection_journal import (
    VerifiedJournal,
    build_journal_import,
    lookup_collection_journal,
    post_collection_journal,
    prepare_collection_journal,
    prepare_journal_correction,
    require_approved_correction,
    process_queued_collection,
    run_distribution_pilot,
    run_distribution_correction,
    send_collection_journal,
    send_approved_correction,
)


class CollectionJournalTests(unittest.TestCase):
    def setUp(self):
        starts = datetime(2026, 11, 27, tzinfo=timezone.utc)
        party = UUID(int=2)
        self.input = dict(
            collection_id=UUID(int=1), status="approved",
            created_at=starts, approved_at=starts + timedelta(minutes=1),
            eligible_from=starts, voucher_date=date(2026, 11, 27),
            party_id=party, amount=Decimal("100.25"),
            party_ledgers={party: "Example party"},
            company_name="Nabiad Distribution Ltd.",
            available_ledgers={"Nabiad-Cash & Bank", "Example party"},
        )

    def test_one_balanced_journal_per_collection_with_stable_reference(self):
        journal = prepare_collection_journal(**self.input)
        self.assertEqual(journal, prepare_collection_journal(**self.input))
        self.assertEqual(journal.amount, Decimal("100.25"))
        self.assertEqual(journal.debit_ledger, "Nabiad-Cash & Bank")
        self.assertEqual(journal.credit_ledger, "Example party")
        other = prepare_collection_journal(**(self.input | {"collection_id": UUID(int=3)}))
        self.assertNotEqual(journal.reference, other.reference)

    def test_ineligible_collections_and_mappings(self):
        for patch in (
            {"status": "pending"}, {"status": "cancelled"},
            {"created_at": self.input["eligible_from"] - timedelta(seconds=1)},
            {"company_name": "Nabiad Cash & Bank"}, {"party_ledgers": {}},
            {"available_ledgers": {"Example party"}},
            {"amount": Decimal("0")}, {"amount": Decimal("1.001")},
        ):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                prepare_collection_journal(**(self.input | patch))


    def test_confirmed_send_is_not_repeated(self):
        journal = prepare_collection_journal(**self.input)
        vouchers = []
        def lookup(company, reference):
            self.assertEqual(company, journal.company_name)
            self.assertEqual(reference, journal.reference)
            return vouchers

        options = dict(lookup=lookup, reserve_first_send=lambda _: True, send=lambda sent: vouchers.append(VerifiedJournal(sent, "guid", "1")))
        post_collection_journal(journal, **options)
        post_collection_journal(journal, **options)
        self.assertEqual(vouchers, [VerifiedJournal(journal, "guid", "1")])

    def test_uncertain_send_is_never_repeated_and_can_be_reconciled(self):
        journal = prepare_collection_journal(**self.input)
        claims, vouchers = set(), []
        def reserve(reference):
            if reference in claims:
                return False
            claims.add(reference)
            return True

        def send(_):
            raise TimeoutError("Lost reply")

        options = dict(lookup=lambda *_: vouchers, reserve_first_send=reserve, send=send)
        with self.assertRaises(TimeoutError):
            post_collection_journal(journal, **options)
        with self.assertRaisesRegex(RuntimeError, "may already have occurred"):
            post_collection_journal(journal, **options)
        vouchers.append(VerifiedJournal(journal, "guid", "1"))
        post_collection_journal(journal, **options)

    def test_conflicting_or_duplicate_reference_blocks_send(self):
        journal = prepare_collection_journal(**self.input)
        for matches in ([VerifiedJournal(replace(journal, amount=Decimal("1")), "other", "2")], [VerifiedJournal(journal, "guid", "1")] * 2):
            with self.assertRaisesRegex(ValueError, "conflicting or duplicate"):
                post_collection_journal(
                    journal, lookup=lambda *_: matches,
                    reserve_first_send=lambda _: self.fail("Unexpected reservation"),
                    send=lambda _: self.fail("Unexpected send"),
                )


    def test_import_xml_targets_distribution_and_balances_one_journal(self):
        journal = prepare_collection_journal(**self.input)
        root = fromstring(build_journal_import(journal))
        self.assertEqual(root.findtext("BODY/DESC/STATICVARIABLES/SVCURRENTCOMPANY"), journal.company_name)
        vouchers = root.findall("BODY/DATA/TALLYMESSAGE/VOUCHER")
        self.assertEqual(len(vouchers), 1)
        voucher = vouchers[0]
        self.assertEqual(voucher.get("ACTION"), "Create")
        self.assertEqual(voucher.findtext("NARRATION"), journal.reference)
        entries = voucher.findall("ALLLEDGERENTRIES.LIST")
        self.assertEqual(
            [(e.findtext("LEDGERNAME"), e.findtext("AMOUNT")) for e in entries],
            [(journal.debit_ledger, "-100.25"), (journal.credit_ledger, "100.25")],
        )
        with self.assertRaises(ValueError):
            build_journal_import(replace(journal, company_name="Nabiad Cash & Bank"))


    def test_sender_accepts_one_create_and_rejects_uncertain_results(self):
        journal = prepare_collection_journal(**self.input)
        url = "http://127.0.0.1:9000"
        result = "<CREATED>1</CREATED><ALTERED>0</ALTERED><COMBINED>0</COMBINED><IGNORED>0</IGNORED><ERRORS>0</ERRORS>"
        envelope = (
            "<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><IMPORTRESULT>"
            + result + "</IMPORTRESULT></DATA></BODY></ENVELOPE>"
        )
        with patch("bridge.tally_post", return_value=envelope) as send:
            send_collection_journal(journal, url)
            send.assert_called_once_with(url, build_journal_import(journal).decode("utf-8"))
        for response in (
            "<RESPONSE><CREATED>1</CREATED></RESPONSE>",
            envelope.replace("<CREATED>1", "<CREATED>2"),
            envelope.replace("<ALTERED>0", "<ALTERED>1"),
            envelope.replace("<ERRORS>0", "<ERRORS>1"),
            envelope.replace("<STATUS>1", "<STATUS>0"),
            "<RESPONSE><LINEERROR>Rejected</LINEERROR>" + result + "</RESPONSE>",
            "",
        ):
            with self.subTest(response=response), patch("bridge.tally_post", return_value=response):
                with self.assertRaises(RuntimeError):
                    send_collection_journal(journal, url)


    def test_lookup_checks_exact_reference_date_and_ledger_amounts(self):
        journal = prepare_collection_journal(**self.input)
        root = fromstring(build_journal_import(journal))
        voucher = root.find("BODY/DATA/TALLYMESSAGE/VOUCHER")
        voucher.set("REMOTEID", "test-guid")
        SubElement(voucher, "VOUCHERNUMBER").text = "42"

        response = tostring(root, encoding="unicode")
        with patch("bridge.tally_post", return_value=response) as tally:
            self.assertEqual(lookup_collection_journal(journal, "mock"), [VerifiedJournal(journal, "test-guid", "42")])
            self.assertIn("<SVCURRENTCOMPANY>Nabiad Distribution Ltd.</SVCURRENTCOMPANY>", tally.call_args.args[1])
        with patch("bridge.tally_post", return_value=response.replace(journal.reference, "other")):
            self.assertEqual(lookup_collection_journal(journal, "mock"), [])
        for invalid in (
            response.replace("20261127", "20261126"),
            response.replace("-100.25", "-101.25"),
            response.replace("test-guid", ""),
            "<RESPONSE><LINEERROR>Wrong company</LINEERROR></RESPONSE>",
        ):
            with self.subTest(invalid=invalid), patch("bridge.tally_post", return_value=invalid):
                with self.assertRaises(RuntimeError):
                    lookup_collection_journal(journal, "mock")


    def test_worker_recovers_verified_voucher_after_status_save_failure(self):
        journal = prepare_collection_journal(**self.input)
        verified = VerifiedJournal(journal, "test-guid", "42")
        options = dict(
            tally_url="mock", allowed_reference=journal.reference,
            reserve_first_send=lambda _: True,
        )
        with (
            patch("collection_journal.lookup_collection_journal", side_effect=[[], [verified], [verified]]),
            patch("collection_journal.send_collection_journal") as send,
        ):
            with self.assertRaisesRegex(RuntimeError, "status could not be saved"):
                process_queued_collection(journal, record_verified=lambda _: False, **options)
            self.assertEqual(
                process_queued_collection(journal, record_verified=lambda value: value == verified, **options),
                verified,
            )
            send.assert_called_once_with(journal, "mock")

    def test_worker_rejects_other_references_before_contacting_tally(self):
        journal = prepare_collection_journal(**self.input)
        with patch("collection_journal.lookup_collection_journal") as lookup:
            with self.assertRaisesRegex(ValueError, "outside the enabled posting pilot"):
                process_queued_collection(
                    journal, tally_url="mock", allowed_reference="some-other-reference",
                    reserve_first_send=lambda _: self.fail("Unexpected reservation"),
                    record_verified=lambda _: self.fail("Unexpected confirmation"),
                )
            lookup.assert_not_called()


    def test_pilot_uses_scoped_rpcs_and_existing_bridge_headers(self):
        journal = prepare_collection_journal(**self.input)
        verified = VerifiedJournal(journal, "guid", "42")
        snapshot = {
            "id": str(self.input["collection_id"]), "party_id": str(self.input["party_id"]),
            "created_at": self.input["created_at"].isoformat(),
            "approved_at": self.input["approved_at"].isoformat(),
            "eligible_from": self.input["eligible_from"].isoformat(),
            "date": journal.voucher_date.isoformat(), "amount": str(journal.amount),
        }
        cfg = {"supabase_url": "https://example.invalid", "tally_url": "mock"}
        args = dict(collection_id=self.input["collection_id"], cfg=cfg,
                    auth_headers={"Authorization": "mock"}, party_ledgers=self.input["party_ledgers"])
        with (
            patch("bridge.http_json", side_effect=[snapshot, True, True]) as rpc,
            patch("bridge.fetch_ledgers", return_value=[{"name": journal.debit_ledger}, {"name": journal.credit_ledger}]),
            patch("collection_journal.lookup_collection_journal", side_effect=[[], [verified]]),
            patch("collection_journal.send_collection_journal") as send,
        ):
            self.assertEqual(run_distribution_pilot(**args), verified)
            self.assertEqual(
                [call.args[1].rsplit("/", 1)[-1] for call in rpc.call_args_list],
                ["get_distribution_posting_pilot", "reserve_distribution_collection_send",
                 "confirm_distribution_collection_send"],
            )
            self.assertTrue(all(call.args[2] == args["auth_headers"] for call in rpc.call_args_list))
            self.assertEqual(rpc.call_args.args[3]["p_voucher_number"], "42")
            send.assert_called_once_with(journal, "mock")


    def test_correction_preserves_voucher_identity_and_approved_values(self):
        journal = prepare_collection_journal(**self.input)
        original = VerifiedJournal(journal, "guid", "42", "100")
        revised = replace(journal, amount=Decimal("110.25"))
        approved = prepare_journal_correction(original, revised, original)
        self.assertEqual(approved.before.voucher_number, "42")
        self.assertEqual(require_approved_correction(approved, revised, original), approved)
        with self.assertRaisesRegex(ValueError, "approved preview"):
            require_approved_correction(approved, replace(revised, amount=Decimal("120")), original)
        with self.assertRaisesRegex(ValueError, "original voucher changed"):
            require_approved_correction(approved, revised, replace(original, alter_id="101"))
        with self.assertRaisesRegex(ValueError, "original collection reference"):
            prepare_journal_correction(original, replace(revised, reference="other"), original)
        with self.assertRaisesRegex(ValueError, "revision is unavailable"):
            unversioned = replace(original, alter_id=None)
            prepare_journal_correction(unversioned, revised, unversioned)


    def test_approved_correction_alters_original_and_verifies_readback(self):
        journal = prepare_collection_journal(**self.input)
        before = VerifiedJournal(journal, "guid", "42", "100", "987")
        after = replace(journal, amount=Decimal("110.25"))
        verified = VerifiedJournal(after, "guid", "42", "101", "987")
        approval = prepare_journal_correction(before, after, before)
        response = (
            "<RESPONSE><CREATED>0</CREATED><ALTERED>1</ALTERED>"
            "<COMBINED>0</COMBINED><IGNORED>0</IGNORED><ERRORS>0</ERRORS></RESPONSE>"
        )
        with (
            patch("collection_journal.lookup_collection_journal", side_effect=[[before], [verified]]),
            patch("bridge.tally_post", return_value=response) as send,
        ):
            self.assertEqual(send_approved_correction(approval, tally_url="mock", reserve_send=lambda: True), verified)
            voucher = fromstring(send.call_args.args[1]).find("BODY/DATA/TALLYMESSAGE/VOUCHER")
            self.assertEqual(voucher.attrib["ACTION"], "Alter")
            self.assertEqual(voucher.attrib["TAGNAME"], "Master ID")
            self.assertEqual(voucher.attrib["TAGVALUE"], "987")
        with (
            patch("collection_journal.lookup_collection_journal", return_value=[before]),
            patch("bridge.tally_post") as send,
        ):
            with self.assertRaisesRegex(RuntimeError, "already have been attempted"):
                send_approved_correction(approval, tally_url="mock", reserve_send=lambda: False)
            send.assert_not_called()


    def test_correction_runner_recovers_reserved_result_without_sending(self):
        original = prepare_collection_journal(**self.input)
        verified = VerifiedJournal(replace(original, amount=Decimal("110.25")), "guid", "42", "rev2", "987")
        values = dict(date=original.voucher_date.isoformat(), party_id=str(self.input["party_id"]), amount="100.25")
        row = dict(before=values, after=values | {"amount": "110.25"}, reserved=True,
                   guid="guid", voucher_number="42", alter_id="rev1", master_id="987")
        with (
            patch("bridge.http_json", side_effect=[row, True]) as rpc,
            patch("bridge.fetch_ledgers", return_value=[{"name": original.debit_ledger}, {"name": original.credit_ledger}]),
            patch("collection_journal.lookup_collection_journal", return_value=[verified]),
            patch("collection_journal.send_approved_correction") as send,
        ):
            result = run_distribution_correction(
                collection_id=self.input["collection_id"], approval_id=UUID(int=99),
                cfg={"supabase_url": "https://example.invalid", "tally_url": "mock"},
                auth_headers={}, party_ledgers=self.input["party_ledgers"],
            )
            self.assertEqual(result, verified)
            self.assertEqual(rpc.call_args.args[3]["p_alter_id"], "rev2")
            send.assert_not_called()
