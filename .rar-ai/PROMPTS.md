# RAR AI Project OS — সহজ বাংলা Prompt Library

এই prompt-গুলো ChatGPT, Claude, Gemini, DeepSeek, Codex বা অন্য AI-তে ব্যবহার করতে পারবেন। শুধু OWNER/PROJECT, branch ও task ID নিজের project অনুযায়ী বদলাবেন।

**মনে রাখবেন:** Private GitHub repository-র link দিলেই সব AI access পায় না। AI-এর authenticated GitHub/repository access থাকতে হবে। না থাকলে প্রয়োজনীয় sanitized file দিন এবং Read-only review চান।

## ১. Existing Project প্রথমবার বুঝিয়ে দিতে

~~~~text
আমি coding expert নই। আমার existing project নিরাপদে continue করতে RAR AI Project OS ব্যবহার করতে চাই।

Repository: OWNER/PROJECT
Default branch: main

প্রথমে কোনো file পরিবর্তন করবেন না।
Repository-এর current source, branch, latest commit এবং project instructions যাচাই করুন।
AGENTS.md এবং .rar-ai/ এর project files পড়ুন।

Actual source দেখে project কী করে, কোন technology ব্যবহার করে, কী কী feature আছে,
কী pending এবং কীভাবে test/deploy হয় তা বুঝুন।
PROJECT_BRIEF.md ও PROJECT_STATE.md-তে কী তথ্য নেই তা জানান।

একবারে একটি করে প্রয়োজনীয় প্রশ্ন করুন।
আগে আমাকে সহজ বাংলায় setup plan ও ঝুঁকি বুঝিয়ে দিন।
আমার অনুমতি ছাড়া existing code overwrite, delete, migration বা deployment করবেন না।
~~~~

## ২. নতুন Project শুরু করতে

~~~~text
আমি একটি নতুন software project শুরু করতে চাই।

Project name: [নাম]
Project কী করবে: [সাধারণ ভাষায় লিখুন]
কাদের জন্য: [ব্যবহারকারী]
প্রয়োজনীয় feature: [যা যা দরকার]
Preferred technology (জানা থাকলে): [PHP / WordPress / Flutter / Python / অন্য]

RAR AI Project OS অনুসরণ করুন।
প্রথমে সহজ ভাষায় project plan, architecture, required tools,
development phases এবং ঝুঁকি বুঝিয়ে দিন।
PROJECT_BRIEF ও acceptance criteria তৈরি করুন।
একবারে একটি করে জরুরি প্রশ্ন করুন।
আমি plan approve না করা পর্যন্ত application code বা production data পরিবর্তন করবেন না।
~~~~

## ৩. নতুন Chat / নতুন AI / অন্য PC থেকে Continue করতে

~~~~text
আমি আগের কাজটি এখান থেকে Continue করতে চাই।

Project repository: OWNER/PROJECT
Task ID: TASK-101
Task branch: ai/101-task-name

RAR AI Project OS-এর নিয়ম অনুসরণ করুন।
AGENTS.md, .rar-ai/PROTOCOL.md, PROJECT_BRIEF.md,
PROJECT_STATE.md, DECISIONS.md এবং সংশ্লিষ্ট task record পড়ুন।

প্রথমে GitHub-এর সর্বশেষ remote branch, commit ও checkpoint verify করুন।
আগের কাজ পুনরায় শুরু থেকে করবেন না।
কী complete হয়েছে, কী pending, কী test হয়েছে এবং পরবর্তী নিরাপদ কাজ কী
সংক্ষেপে আমাকে জানান।

Source বা GitHub access না থাকলে অনুমান করবেন না; শুধু প্রয়োজনীয়
file বা access চাইবেন। পুরোনো chat-কে source of truth ধরবেন না।
আমার অনুমতি ছাড়া destructive change বা production deployment করবেন না।
~~~~

## ৪. PC বন্ধ / AI পরিবর্তনের আগে Handover করতে

~~~~text
আজকের কাজ শেষ করার আগে CHECKPOINT & HANDOVER করুন।

১. আজ কী কী পরিবর্তন করেছেন এবং কোন file পরিবর্তন হয়েছে দেখান।
২. প্রাসঙ্গিক test চালান; যা চালাতে পারেননি NOT RUN লিখুন।
৩. .rar-ai/PROJECT_STATE.md এবং সংশ্লিষ্ট task record update করুন।
৪. অনুমোদিত হলে current task branch-এ changes ও checkpoint commit করুন।
৫. GitHub-এ push করে remote branch/head এবং checkpoint verify করুন।
৬. পরবর্তী AI বা PC-এর জন্য pending কাজ, blocker, risk ও next safe action লিখুন।

Push করতে না পারলে LOCAL ONLY / UNPERSISTED বলুন।
কোনো force push, reset, clean, delete বা production deploy করবেন না।
অন্য PC থেকে Continue করা নিরাপদ কি না স্পষ্ট করে জানান।
~~~~

## ৫. Phone থেকে কাজ করতে

~~~~text
আমি এখন Phone থেকে কাজ করছি।

Project repository: OWNER/PROJECT
Task ID: TASK-101
Task branch: ai/101-task-name

প্রথমে current remote repository ও checkpoint verify করুন।
আপনার GitHub access read-only নাকি write-capable, স্পষ্ট করুন।
Access না থাকলে প্রয়োজনীয় sanitized file-এর তালিকা দিন।
এখন কোনো production change, delete বা deployment করবেন না।
প্রথমে সমস্যাটি বুঝিয়ে ছোট ও নিরাপদ next step দিন।
~~~~

## ৬. AI-কে কোনো command চালানোর আগে বুঝিয়ে বলতে

~~~~text
আমি এই command-এর technical details বুঝতে পারছি না।
প্রথমে command-টি কী করবে, কোন folder/repository-তে কাজ করবে,
কোন file পরিবর্তন করতে পারে এবং ঝুঁকি কী — সহজ বাংলায় বুঝিয়ে দিন।
এখনই execute করবেন না। আগে আমার অনুমতি নিন।
~~~~

## ৭. Chat-only / GitHub access নেই

~~~~text
আমার এই AI session-এ repository-তে direct GitHub access নেই।
আমি যে files/screenshot/source দিয়েছি সেগুলোকে নির্দিষ্ট commit SHA-র snapshot হিসেবে ধরুন।
প্রথমে Read-only analysis করুন; কোনো remote change হয়েছে দাবি করবেন না।
যে exact file বা evidence ছাড়া সিদ্ধান্ত দেওয়া যাবে না, শুধু সেটুকুই চাইবেন।
প্রস্তাবিত code change হলে patch/diff আকারে দিন, এবং কোন base commit-এর জন্য
patch তৈরি তা লিখুন। Authorized PC/repository writer apply ও test করবে।
কোনো secret, .env, customer data বা production database চাইবেন না।
~~~~

## ৮. Prompt পাঠানোর পর AI-কে কী করতে বলবেন?

- প্রথমে repository, branch, task ID ও latest commit যাচাই করতে বলুন।
- AI access না পেলে private link দেখে নিয়েছে এমন দাবি করতে দেবেন না।
- কাজ শুরুর আগে ছোট plan ও affected files জেনে নিন।
- কাজ শেষে actual test result, commit/push status ও checkpoint verification চান।
- একই branch-এ একসঙ্গে একাধিক AI/PC দিয়ে write করবেন না।
- Handover complete না হলে অন্য device-এ uncommitted কাজ পাওয়া যাবে না।

**Shortcut:** একই project/task-এর context ইতিমধ্যে নিশ্চিত থাকলে “Continue from the latest verified checkpoint” বলতে পারেন। নতুন chat বা নতুন AI হলে Repository + Task ID + Branch অবশ্যই দিন।
