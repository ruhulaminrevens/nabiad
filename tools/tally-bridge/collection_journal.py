"""Prepare collection journals for a Tally pilot without making network calls."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID
from xml.etree.ElementTree import Element, ParseError, SubElement, fromstring, tostring

DISTRIBUTION_COMPANY = "Nabiad Distribution Ltd."
DEBIT_LEDGER = "Nabiad-Cash & Bank"


@dataclass(frozen=True)
class CollectionJournal:
    reference: str
    company_name: str
    voucher_date: date
    debit_ledger: str
    credit_ledger: str
    amount: Decimal


@dataclass(frozen=True)
class VerifiedJournal:
    journal: CollectionJournal
    guid: str
    voucher_number: str
    alter_id: str | None = None
    master_id: str | None = None


def prepare_collection_journal(
    *,
    collection_id: UUID,
    status: str,
    created_at: datetime,
    approved_at: datetime,
    eligible_from: datetime,
    voucher_date: date,
    party_id: UUID,
    amount: Decimal,
    party_ledgers: dict[UUID, str],
    company_name: str,
    available_ledgers: set[str],
) -> CollectionJournal:
    """Validate a newly approved collection against explicit ledger mappings."""
    if status != "approved":
        raise ValueError("The collection must be approved")
    if any(t.utcoffset() is None for t in (created_at, approved_at, eligible_from)):
        raise ValueError("Eligibility and approval timestamps must include time zones")
    if not eligible_from <= created_at <= approved_at:
        raise ValueError("The collection was created before the pilot or has an invalid approval time")
    if company_name != DISTRIBUTION_COMPANY:
        raise ValueError("Company is outside the Distribution posting scope")
    credit_ledger = party_ledgers.get(party_id)
    if not credit_ledger or credit_ledger.casefold() == DEBIT_LEDGER.casefold():
        raise ValueError("A distinct Distribution party ledger mapping is required")
    if not {DEBIT_LEDGER, credit_ledger} <= available_ledgers:
        raise ValueError("Both mapped ledgers must exist in the target company")
    if (
        not amount.is_finite()
        or not Decimal("0") < amount <= Decimal("999999999999.99")
        or amount != amount.quantize(Decimal("0.01"))
    ):
        raise ValueError("The collection amount must be positive and use at most two decimal places")
    return CollectionJournal(
        reference=f"nabiad-distribution-collection:{collection_id}",
        company_name=company_name,
        voucher_date=voucher_date,
        debit_ledger=DEBIT_LEDGER,
        credit_ledger=credit_ledger,
        amount=amount,
    )


def post_collection_journal(
    journal: CollectionJournal,
    *,
    lookup: Callable[[str, str], Sequence[VerifiedJournal]],
    reserve_first_send: Callable[[str], bool],
    send: Callable[[CollectionJournal], None],
) -> VerifiedJournal:
    """Return only when one matching voucher is visible in the target company.

    reserve_first_send must atomically record a durable claim before allowing a
    send. An existing claim with no visible voucher requires manual review.
    """
    matches = lookup(journal.company_name, journal.reference)
    if matches:
        if len(matches) == 1 and matches[0].journal == journal:
            return matches[0]
        raise ValueError("The Tally reference has conflicting or duplicate vouchers")
    if not reserve_first_send(journal.reference):
        raise RuntimeError("A send may already have occurred. Check Tally before retrying.")
    send(journal)
    matches = lookup(journal.company_name, journal.reference)
    if len(matches) != 1 or matches[0].journal != journal:
        raise RuntimeError("Tally has not confirmed one matching voucher. Check before retrying.")
    return matches[0]


def build_journal_import(journal: CollectionJournal) -> bytes:
    """Build a company-scoped Tally XML request for a single new voucher."""
    if journal.company_name != DISTRIBUTION_COMPANY:
        raise ValueError("Company is outside the Distribution posting scope")
    envelope = Element("ENVELOPE")
    header = SubElement(envelope, "HEADER")
    for tag, value in (("VERSION", "1"), ("TALLYREQUEST", "Import"), ("TYPE", "Data"), ("ID", "Vouchers")):
        SubElement(header, tag).text = value
    body = SubElement(envelope, "BODY")
    variables = SubElement(SubElement(body, "DESC"), "STATICVARIABLES")
    SubElement(variables, "SVCURRENTCOMPANY").text = journal.company_name
    message = SubElement(SubElement(body, "DATA"), "TALLYMESSAGE")
    voucher = SubElement(message, "VOUCHER", {"VCHTYPE": "Journal", "ACTION": "Create"})
    SubElement(voucher, "DATE").text = journal.voucher_date.strftime("%Y%m%d")
    SubElement(voucher, "VOUCHERTYPENAME").text = "Journal"
    SubElement(voucher, "NARRATION").text = journal.reference
    for ledger, debit in ((journal.debit_ledger, True), (journal.credit_ledger, False)):
        entry = SubElement(voucher, "ALLLEDGERENTRIES.LIST")
        SubElement(entry, "LEDGERNAME").text = ledger
        SubElement(entry, "ISDEEMEDPOSITIVE").text = "Yes" if debit else "No"
        SubElement(entry, "AMOUNT").text = format(-journal.amount if debit else journal.amount, ".2f")
    return tostring(envelope, encoding="utf-8")


def validate_journal_import(response: str, *, alteration: bool = False) -> None:
    """Require exactly one expected voucher operation and no side effects."""
    try:
        root = fromstring(response)
    except ParseError as exc:
        raise RuntimeError("Tally returned an unreadable voucher response") from exc

    if root.tag == "ENVELOPE":
        result = root.find("BODY/DATA/IMPORTRESULT")
        success = root.findtext("HEADER/STATUS") == "1"
    else:
        result = root if root.tag == "RESPONSE" else None
        success = result is not None

    if (
        not success
        or result is None
        or root.find(".//LINEERROR") is not None
        or result.findtext("CREATED") != ("0" if alteration else "1")
        or result.findtext("ALTERED") != ("1" if alteration else "0")
        or any(result.findtext(tag) != "0" for tag in ("COMBINED", "IGNORED", "ERRORS"))
        or result.findtext("DELETED", "0") != "0"
        or result.findtext("CANCELLED", "0") != "0"
    ):
        expected = "voucher alteration" if alteration else "new voucher"
        raise RuntimeError(f"Tally did not confirm exactly one {expected}")


def send_collection_journal(journal: CollectionJournal, tally_url: str) -> None:
    """Send one reserved import. The caller must still verify it by reference."""
    from bridge import tally_post

    payload = build_journal_import(journal).decode("utf-8")
    validate_journal_import(tally_post(tally_url, payload))


def lookup_collection_journal(journal: CollectionJournal, tally_url: str) -> list[VerifiedJournal]:
    """Read the company Day Book and verify a voucher with the exact reference."""
    from bridge import USE_SELECTED_COMPANY, child_text, local, parse_root, request_xml, tally_post

    if journal.company_name != DISTRIBUTION_COMPANY or journal.company_name in USE_SELECTED_COMPANY:
        raise ValueError("Voucher lookup requires the explicit Distribution company")
    day = journal.voucher_date.strftime("%d-%b-%Y")
    request = request_xml(
        "Day Book", journal.company_name,
        {"SVCURRENTDATE": day, "SVFROMDATE": day, "SVTODATE": day},
    )
    root = parse_root(tally_post(tally_url, request))
    if root.tag != "ENVELOPE" or any(
        local(node.tag) == "LINEERROR"
        or (local(node.tag) == "STATUS" and (node.text or "").strip() == "0")
        for node in root.iter()
    ):
        raise RuntimeError("Tally did not return a usable Day Book")

    matches = []
    for voucher in root.iter():
        if local(voucher.tag) != "VOUCHER":
            continue
        if child_text(voucher, "DATE") != journal.voucher_date.strftime("%Y%m%d"):
            raise RuntimeError("Tally returned a voucher outside the requested date")
        if child_text(voucher, "NARRATION") != journal.reference:
            continue
        voucher_type = child_text(voucher, "VOUCHERTYPENAME") or voucher.get("VCHTYPE")
        guid = child_text(voucher, "GUID") or voucher.get("REMOTEID")
        voucher_number = child_text(voucher, "VOUCHERNUMBER")
        if (
            voucher_type != "Journal" or not guid or not voucher_number
            or child_text(voucher, "ISCANCELLED").lower() == "yes"
            or child_text(voucher, "ISDELETED").lower() == "yes"
        ):
            raise RuntimeError("The referenced Tally voucher is not an active Journal")
        try:
            entries = [
                (child_text(entry, "LEDGERNAME"), Decimal(child_text(entry, "AMOUNT")))
                for entry in voucher
                if local(entry.tag) in ("ALLLEDGERENTRIES.LIST", "LEDGERENTRIES.LIST")
            ]
        except InvalidOperation as exc:
            raise RuntimeError("The referenced voucher contains an invalid amount") from exc
        if len(entries) != 2 or not all(amount.is_finite() for _, amount in entries) or set(entries) != {
            (journal.debit_ledger, -journal.amount),
            (journal.credit_ledger, journal.amount),
        }:
            raise RuntimeError("The referenced voucher has different ledgers or amounts")
        matches.append(VerifiedJournal(
            journal, guid, voucher_number,
            child_text(voucher, "ALTERID") or None,
            child_text(voucher, "MASTERID") or None,
        ))
    return matches


def process_queued_collection(
    journal: CollectionJournal,
    *,
    tally_url: str,
    allowed_reference: str,
    reserve_first_send: Callable[[str], bool],
    record_verified: Callable[[VerifiedJournal], bool],
) -> VerifiedJournal:
    """Process the one reference explicitly enabled for the pilot."""
    if not allowed_reference or journal.reference != allowed_reference:
        raise ValueError("This collection is outside the enabled posting pilot")
    verified = post_collection_journal(
        journal,
        lookup=lambda _company, _reference: lookup_collection_journal(journal, tally_url),
        reserve_first_send=reserve_first_send,
        send=lambda pending: send_collection_journal(pending, tally_url),
    )
    if record_verified(verified) is not True:
        raise RuntimeError("The voucher exists in Tally but its status could not be saved")
    return verified


def run_distribution_pilot(
    *,
    collection_id: UUID,
    cfg: dict,
    auth_headers: dict,
    party_ledgers: dict[UUID, str],
) -> VerifiedJournal | None:
    """Run one explicitly configured pilot using the existing Bridge login."""
    from bridge import USE_SELECTED_COMPANY, fetch_ledgers, http_json

    if DISTRIBUTION_COMPANY in USE_SELECTED_COMPANY:
        raise ValueError("The pilot requires an explicitly selected Distribution company")

    rpc_url = cfg["supabase_url"].rstrip("/") + "/rest/v1/rpc/"
    identity = {"p_collection_id": str(collection_id)}

    def rpc(name, payload):
        return http_json("POST", rpc_url + name, auth_headers, payload)

    snapshot = rpc("get_distribution_posting_pilot", identity)
    if snapshot is None:
        return None
    if snapshot["id"] != str(collection_id):
        raise RuntimeError("The posting queue returned a different collection")
    ledgers = fetch_ledgers(cfg, DISTRIBUTION_COMPANY, lambda _message: None)
    journal = prepare_collection_journal(
        collection_id=collection_id, status="approved",
        created_at=datetime.fromisoformat(snapshot["created_at"]),
        approved_at=datetime.fromisoformat(snapshot["approved_at"]),
        eligible_from=datetime.fromisoformat(snapshot["eligible_from"]),
        voucher_date=date.fromisoformat(snapshot["date"]),
        party_id=UUID(snapshot["party_id"]),
        amount=Decimal(snapshot["amount"]),
        party_ledgers=party_ledgers, company_name=DISTRIBUTION_COMPANY,
        available_ledgers={ledger["name"] for ledger in ledgers},
    )

    def confirm(verified):
        return rpc("confirm_distribution_collection_send", {
            **identity,
            "p_tally_guid": verified.guid,
            "p_voucher_number": verified.voucher_number,
            "p_alter_id": verified.alter_id,
            "p_master_id": verified.master_id,
        })

    return process_queued_collection(
        journal, tally_url=cfg["tally_url"], allowed_reference=journal.reference,
        reserve_first_send=lambda _: rpc("reserve_distribution_collection_send", identity) is True,
        record_verified=confirm,
    )


@dataclass(frozen=True)
class JournalCorrection:
    before: VerifiedJournal
    after: CollectionJournal


def prepare_journal_correction(
    previous: VerifiedJournal,
    proposed: CollectionJournal,
    current: VerifiedJournal,
) -> JournalCorrection:
    """Build a before/after preview only while the original voucher is unchanged."""
    if previous.journal.company_name != DISTRIBUTION_COMPANY or proposed.company_name != DISTRIBUTION_COMPANY:
        raise ValueError("Correction is outside the Distribution posting scope")
    if not previous.guid or not previous.alter_id or current != previous:
        raise ValueError("The original voucher changed or its Tally revision is unavailable")
    if proposed.reference != previous.journal.reference:
        raise ValueError("Correction must use the original collection reference")
    if proposed == previous.journal:
        raise ValueError("The proposed correction has no Journal changes")
    return JournalCorrection(before=previous, after=proposed)


def require_approved_correction(
    approved: JournalCorrection,
    proposed: CollectionJournal,
    current: VerifiedJournal,
) -> JournalCorrection:
    """Reject a changed proposal or voucher after permission was recorded."""
    candidate = prepare_journal_correction(approved.before, proposed, current)
    if candidate != approved:
        raise ValueError("The Journal change differs from the approved preview")
    return candidate

def send_approved_correction(
    approved: JournalCorrection,
    *,
    tally_url: str,
    reserve_send: Callable[[], bool],
) -> VerifiedJournal:
    """Alter one verified voucher after a durable approval reservation."""
    from bridge import tally_post

    before, after = approved.before, approved.after
    matches = lookup_collection_journal(before.journal, tally_url)
    if len(matches) != 1:
        raise RuntimeError("The original Journal could not be uniquely verified")
    require_approved_correction(approved, after, matches[0])
    if not before.master_id or not before.master_id.isascii() or not before.master_id.isdecimal():
        raise ValueError("The original Tally Master ID is required for correction")

    envelope = fromstring(build_journal_import(after))
    voucher = envelope.find("BODY/DATA/TALLYMESSAGE/VOUCHER")
    voucher.attrib.update({
        "ACTION": "Alter",
        "DATE": before.journal.voucher_date.strftime("%d-%b-%Y"),
        "TAGNAME": "Master ID",
        "TAGVALUE": before.master_id,
    })
    if not reserve_send():
        raise RuntimeError("This correction may already have been attempted. Check Tally first.")
    response = tally_post(tally_url, tostring(envelope, encoding="unicode"))
    validate_journal_import(response, alteration=True)
    updated = lookup_collection_journal(after, tally_url)
    if (
        len(updated) != 1 or updated[0].guid != before.guid
        or updated[0].master_id != before.master_id
        or not updated[0].alter_id or updated[0].alter_id == before.alter_id
    ):
        raise RuntimeError("Tally did not confirm the update on the original Journal")
    return updated[0]

def run_distribution_correction(
    *,
    collection_id: UUID,
    approval_id: UUID,
    cfg: dict,
    auth_headers: dict,
    party_ledgers: dict[UUID, str],
) -> VerifiedJournal | None:
    """Load one scoped approval and save the verified revision."""
    from bridge import USE_SELECTED_COMPANY, fetch_ledgers, http_json

    if DISTRIBUTION_COMPANY in USE_SELECTED_COMPANY:
        raise ValueError("The pilot requires an explicitly selected Distribution company")
    rpc_url = cfg["supabase_url"].rstrip("/") + "/rest/v1/rpc/"
    identity = {"p_collection_id": str(collection_id), "p_approval_id": str(approval_id)}

    def rpc(name, payload):
        return http_json("POST", rpc_url + name, auth_headers, payload)

    row = rpc("get_distribution_posting_correction", identity)
    if row is None:
        return None
    ledgers = fetch_ledgers(cfg, DISTRIBUTION_COMPANY, lambda _message: None)
    available = {ledger["name"] for ledger in ledgers}

    def journal(snapshot):
        credit = party_ledgers.get(UUID(snapshot["party_id"]))
        if not credit or credit.casefold() == DEBIT_LEDGER.casefold() or not {credit, DEBIT_LEDGER} <= available:
            raise ValueError("Both correction ledgers must be mapped in Tally")
        amount = Decimal(str(snapshot["amount"]))
        if not amount.is_finite() or not Decimal("0") < amount <= Decimal("999999999999.99") or amount != amount.quantize(Decimal("0.01")):
            raise ValueError("Invalid approved correction amount")
        return CollectionJournal(
            f"nabiad-distribution-collection:{collection_id}", DISTRIBUTION_COMPANY,
            date.fromisoformat(snapshot["date"]), DEBIT_LEDGER, credit, amount,
        )

    before, after = journal(row["before"]), journal(row["after"])
    approval = JournalCorrection(
        VerifiedJournal(before, row["guid"], row["voucher_number"], row["alter_id"], row["master_id"]),
        after,
    )
    if row["reserved"]:
        matches = lookup_collection_journal(after, cfg["tally_url"])
        if (
            len(matches) != 1 or matches[0].guid != approval.before.guid
            or matches[0].master_id != approval.before.master_id
            or not matches[0].alter_id or matches[0].alter_id == approval.before.alter_id
        ):
            raise RuntimeError("A correction was attempted. Review the original Journal in Tally.")
        verified = matches[0]
    else:
        verified = send_approved_correction(
            approval, tally_url=cfg["tally_url"],
            reserve_send=lambda: rpc("reserve_distribution_correction_send", identity) is True,
        )
    if rpc("confirm_distribution_correction_send", {
        **identity, "p_guid": verified.guid, "p_master_id": verified.master_id,
        "p_voucher_number": verified.voucher_number, "p_alter_id": verified.alter_id,
    }) is not True:
        raise RuntimeError("The correction exists in Tally but its verified revision could not be saved")
    return verified

def main(argv: list[str] | None = None) -> int:
    """Run the separately enabled, single-collection posting pilot."""
    import argparse
    import json
    from pathlib import Path
    from urllib.parse import urlsplit

    from bridge import sb_login

    parser = argparse.ArgumentParser(description=main.__doc__)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--collection-id", required=True, type=UUID)
    parser.add_argument("--party-id", required=True, type=UUID)
    parser.add_argument("--party-ledger", required=True)
    parser.add_argument("--approval-id", type=UUID, help="execute the specified correction approval")
    parser.add_argument("--previous-party-id", type=UUID)
    parser.add_argument("--previous-party-ledger")
    parser.add_argument("--confirm-live-post", action="store_true")
    args = parser.parse_args(argv)
    if not args.confirm_live_post:
        parser.error("--confirm-live-post is required to run the posting pilot")

    with args.config.open(encoding="utf-8-sig") as config:
        cfg = json.load(config)
    tally = urlsplit(cfg["tally_url"])
    if (
        tally.scheme != "http"
        or tally.hostname not in {"localhost", "127.0.0.1", "::1"}
        or tally.username is not None
        or tally.path not in {"", "/"}
        or tally.query or tally.fragment
    ):
        parser.error("Run the pilot on the Tally host with a local HTTP endpoint")
    if urlsplit(cfg["supabase_url"]).scheme != "https":
        parser.error("The Bridge database URL must use HTTPS")
    if DISTRIBUTION_COMPANY not in cfg.get("companies", []) or DISTRIBUTION_COMPANY in cfg.get("use_selected_company", []):
        parser.error("The Bridge config must specify the Distribution company explicitly")

    if bool(args.previous_party_id) != bool(args.previous_party_ledger):
        parser.error("Provide both previous party mapping arguments together")
    party_ledgers = {args.party_id: args.party_ledger}
    if args.previous_party_id:
        if not args.approval_id or args.previous_party_id == args.party_id:
            parser.error("The previous mapping is for a correction with a different party")
        party_ledgers[args.previous_party_id] = args.previous_party_ledger
    options = dict(collection_id=args.collection_id, cfg=cfg, auth_headers=sb_login(cfg), party_ledgers=party_ledgers)
    verified = (
        run_distribution_correction(approval_id=args.approval_id, **options)
        if args.approval_id else run_distribution_pilot(**options)
    )
    if verified is None:
        print("No unverified pilot collection is available for this account and reference.")
        return 2
    print(f"Verified in Tally: Journal {verified.voucher_number}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
