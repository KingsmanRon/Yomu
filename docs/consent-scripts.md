# Consent and privacy scripts

> **Draft: requires review before any real-world use.** These scripts were written by the product team, not by native speakers. Each must be reviewed by a native isiZulu speaker, a native Sesotho speaker (South African orthography), an adult-literacy educator and the organisation's information officer (POPIA).
>
> Generated from `content/app/lines.json` by `npm run docs:consent`; do not edit by hand. Change the scripts in that file (the app speaks them from there), then regenerate.

Consent script version: `2026-10-26.1` (`CONSENT_VERSION` in `src/config/app.ts`). Every consent record stores this version. Bump it whenever a consent script changes: the server refuses consent given under an outdated version, so no record can claim a script the learner did not hear.

Review status: 0 of 41 isiZulu lines and 0 of 41 Sesotho lines are approved. Until a line is approved the app shows the amber "unreviewed content" marker beside it.

How learners meet these scripts: every line is spoken in the learner's language, can be replayed with the large listen-again button, and is shown as a caption for those who read. Buttons carry an icon as well as a short label. Nothing is stored on the server before the learner agrees, and a guest's learning never leaves the phone.

## Review points for the information officer

- `consent.who` says only the learner can see their information. The platform operator's staff can also reach it (database administration, and platform administrators see the aggregated, anonymised pilot figures). Decide whether the script must say so.
- `consent.what` names the main kinds of information. The full list (device link, consent records, facilitator help, random pseudonym, tutor question text with its retention period) is in docs/data-inventory.md. Decide whether the spoken script needs more detail or a pointer to where the full list can be heard or read.
- `consent.delete` says "tap the picture of the bin". In the app, deletion is under Me > Privacy and needs a press-and-hold on the red bin button (so it cannot happen by accident). Align the wording with the final screen.
- `consent.analytics` asks in one sentence. Confirm that learners understand that "count how you use the app" means pseudonymous usage events (which screens and lessons are opened and left, which help is asked for), kept 13 months.
- The scripts do not name the responsible party or an information officer contact. POPIA requires that the learner can find out who is responsible; decide how this is given (spoken line, printed sheet from the facilitator, or both).
- Pilot research consent is separate from these scripts and is not in the app yet: see docs/pilot-measurement-plan.md.

## 1. Where learning is kept

**When:** After the learner has chosen a picture and a secret code. Choosing the phone only (guest) stores nothing on the server and needs no server consent.

**What is recorded:** Nothing.

### `save.choice`

Offer to save progress online (registration) or keep it on the phone (guest).

- **English (source):** You can keep your learning on this phone only, or keep it safely on the internet so that it is not lost. Keeping it on the internet uses a little data.
- **isiZulu** (draft): Ungagcina ukufunda kwakho kule foni kuphela, noma usigcine ku-inthanethi ngokuphepha ukuze singalahleki. Ukugcina ku-inthanethi kusebenzisa idatha encane.
- **Sesotho** (draft): O ka boloka thuto ya hao founung ena feela, kapa o e boloke inthaneteng ka polokeho hore e se ke ya lahleha. Ho boloka inthaneteng ho sebedisa data e nyane.

### `save.online`

Button: save online (leads to spoken consent).

- **English (source):** I want to keep it on the internet.
- **isiZulu** (draft): Ngifuna ukugcina ku-inthanethi. Button label: "Gcina ku-inthanethi".
- **Sesotho** (draft): Ke batla ho boloka inthaneteng. Button label: "Boloka inthaneteng".

### `save.phone_only`

Button: keep on this phone only (guest).

- **English (source):** Keep it on this phone only.
- **isiZulu** (draft): Gcina kule foni kuphela. Button label: "Kule foni kuphela".
- **Sesotho** (draft): Boloka founung ena feela. Button label: "Founung ena feela".

## 2. Consent to keep learning online

**When:** Before anything about the learner is stored on the server. The five explanation lines play one after another; the agree button unlocks once they have played, and every line can be replayed.

**What is recorded:** `consent_records`: type `account_storage`, script version, language, method `spoken_explanation_button`, time. Nothing is stored if the learner declines.

### `consent.intro`

Consent 1/5 (POPIA): before anything is stored on the server.

- **English (source):** Before we keep your information on the internet, listen to this.
- **isiZulu** (draft): Ngaphambi kokuthi sigcine imininingwane yakho ku-inthanethi, lalela lokhu.
- **Sesotho** (draft): Pele re boloka dintlha tsa hao inthaneteng, mamela sena.

### `consent.what`

Consent 2/5: what is stored.

- **English (source):** We will keep: your picture, your secret code, locked so that nobody can read it, your language, and your progress: lessons, answers and skills. We do not need your name. We do not keep your voice.
- **isiZulu** (draft): Sizogcina: isithombe sakho, ikhodi yakho eyimfihlo ivalelwe ukuze kungabikho muntu oyifundayo, ulimi lwakho, nenqubekela phambili yakho: izifundo, izimpendulo namakhono. Asilidingi igama lakho. Asiligcini izwi lakho.
- **Sesotho** (draft): Re tla boloka: setshwantsho sa hao, khoutu ya hao ya lekunutu e notleletswe hore ho se be motho ya e balang, puo ya hao, le tswelopele ya hao: dithuto, dikarabo le bokgoni. Ha re hloke lebitso la hao. Ha re boloke lentswe la hao.

### `consent.why`

Consent 3/5: why.

- **English (source):** Why: so that your learning is not lost if your phone is lost or broken, and so that you can carry on using another phone.
- **isiZulu** (draft): Kungani: ukuze ukufunda kwakho kungalahleki uma ifoni yakho ilahleka noma iphuka, nokuze uqhubeke kwenye ifoni.
- **Sesotho** (draft): Hobaneng: hore thuto ya hao e se ke ya lahleha ha founu ya hao e lahleha kapa e robeha, le hore o tswele pele founung e nngwe.

### `consent.who`

Consent 4/5: who can see it.

- **English (source):** Who can see it: only you. If you join a class later, we will first ask you what your teacher may see. We will never sell your information.
- **isiZulu** (draft): Ubani ongakubona: nguwe kuphela. Uma ujoyina ikilasi kamuva, sizokubuza kuqala ukuthi uthisha wakho angabonani. Asisoze sayithengisa imininingwane yakho.
- **Sesotho** (draft): Ke mang ya ka e bonang: ke wena feela. Ha o kena tlelaseng hamorao, re tla o botsa pele hore titjhere ya hao a ka bona eng. Ha ho mohla re tla rekisa dintlha tsa hao.

### `consent.delete`

Consent 5/5: how to delete.

- **English (source):** You can stop at any time. In Me, tap the picture of the bin to delete everything. It is deleted straight away, without phoning anyone.
- **isiZulu** (draft): Ungayeka noma nini. Ku-Mina, thinta isithombe somgqomo ukuze ususe konke. Kuzosuswa ngokushesha, ngaphandle kokushayela muntu.
- **Sesotho** (draft): O ka emisa neng kapa neng. Ho Nna, tobetsa setshwantsho sa motomo ho hlakola tsohle. Di tla hlakolwa hang-hang, ntle le ho letsetsa motho.

### `consent.question`

Consent question.

- **English (source):** Do you agree that we keep your learning safely on the internet?
- **isiZulu** (draft): Uyavuma ukuthi sigcine ukufunda kwakho ku-inthanethi ngokuphepha?
- **Sesotho** (draft): Na o dumela hore re boloke thuto ya hao inthaneteng ka polokeho?

### `consent.agree`

Consent button: agree.

- **English (source):** Yes, I agree.
- **isiZulu** (draft): Yebo, ngiyavuma. Button label: "Yebo, ngiyavuma".
- **Sesotho** (draft): E, ke a dumela. Button label: "E, ke a dumela".

### `consent.decline`

Consent button: keep on phone only.

- **English (source):** No, keep it on this phone only.
- **isiZulu** (draft): Cha, gcina kule foni kuphela. Button label: "Cha, kule foni kuphela".
- **Sesotho** (draft): Tjhe, boloka founung feela. Button label: "Tjhe, founung feela".

### `consent.pin`

Confirm the PIN to save it safely online.

- **English (source):** Tap your secret code again, so that we can keep it safely.
- **isiZulu** (draft): Thinta ikhodi yakho eyimfihlo futhi, ukuze siyigcine ngokuphepha.
- **Sesotho** (draft): Tobetsa khoutu ya hao ya lekunutu hape, hore re e boloke ka polokeho.

### `consent.saved`

After registration succeeded.

- **English (source):** Thank you. Your learning is now kept safely.
- **isiZulu** (draft): Siyabonga. Ukufunda kwakho sekugciniwe ngokuphepha.
- **Sesotho** (draft): Re a leboha. Thuto ya hao jwale e bolokilwe ka polokeho.

### `consent.declined`

After declining consent.

- **English (source):** That is fine. Your learning will stay on this phone only. You can change your mind later in Me.
- **isiZulu** (draft): Kulungile. Ukufunda kwakho kuzohlala kule foni kuphela. Ungashintsha umqondo kamuva ku-Mina.
- **Sesotho** (draft): Ho lokile. Thuto ya hao e tla dula founung ena feela. O ka fetola mohopolo hamorao ho Nna.

### `consent.offline`

Registration needs the internet.

- **English (source):** Keeping it on the internet needs the internet. For now, your learning stays on this phone.
- **isiZulu** (draft): Ukugcina ku-inthanethi kudinga i-inthanethi. Okwamanje, ukufunda kwakho kuhlala kule foni.
- **Sesotho** (draft): Ho boloka inthaneteng ho hloka inthanete. Hajwale, thuto ya hao e dula founung ena.

## 3. Usage counts (optional, separate question)

**When:** Straight after agreeing to online storage, answered with the yes and no buttons below; changeable at any time in Me > Privacy.

**What is recorded:** `consent_records`: type `analytics` when the answer is yes; `withdrawn_at` when it later changes to no. Usage events are sent only while this consent is in force.

### `consent.analytics`

Separate optional consent: pseudonymous usage counts.

- **English (source):** May we count how you use the app, without your name, so that we can improve it? You can change this at any time in Me.
- **isiZulu** (draft): Singabala ukuthi uyisebenzisa kanjani i-app, ngaphandle kwegama lakho, ukuze siyithuthukise? Ungashintsha lokhu noma nini ku-Mina.
- **Sesotho** (draft): Na re ka bala hore o sebedisa app jwang, ntle le lebitso la hao, e le hore re e ntlafatse? O ka fetola sena neng kapa neng ho Nna.

### `share.yes`

Yes button.

- **English (source):** Yes.
- **isiZulu** (draft): Yebo. Button label: "Yebo".
- **Sesotho** (draft): E. Button label: "E".

### `share.no`

No button.

- **English (source):** No.
- **isiZulu** (draft): Cha. Button label: "Cha".
- **Sesotho** (draft): Tjhe. Button label: "Tjhe".

## 4. Microphone

**When:** Before the phone asks for microphone permission (listen-and-repeat self-checks, spoken questions to the helper). Refusing changes nothing else.

**What is recorded:** Nothing on the server. Recordings stay in the phone's memory and are discarded when the activity ends.

### `mic.explain`

Before asking for microphone permission.

- **English (source):** Some activities ask you to say words aloud. To let you hear yourself, the app needs the microphone. Your voice stays on this phone and is deleted when the activity ends. You can say no and still use everything.
- **isiZulu** (draft): Eminye imisebenzi ikucela ukuthi usho amagama ngezwi. Ukuze uzizwe, i-app idinga imakrofoni. Izwi lakho lihlala kule foni futhi liyasuswa uma umsebenzi uphela. Ungathi cha futhi usasebenzisa konke.
- **Sesotho** (draft): Mesebetsi e meng e o kopa ho bua mantswe ka lentswe. Ho iutlwa, app e hloka maekrofounu. Lentswe la hao le dula founung ena mme le hlakolwa ha mosebetsi o fela. O ka re tjhe mme wa nna wa sebedisa tsohle.

### `mic.allow`

Allow microphone button.

- **English (source):** Allow the microphone.
- **isiZulu** (draft): Vumela imakrofoni. Button label: "Vumela imakrofoni".
- **Sesotho** (draft): Dumella maekrofounu. Button label: "Dumella maekrofounu".

### `mic.no`

Decline microphone button.

- **English (source):** No, thank you.
- **isiZulu** (draft): Cha, ngiyabonga. Button label: "Cha, ngiyabonga".
- **Sesotho** (draft): Tjhe, ke a leboha. Button label: "Tjhe, ke a leboha".

### `mic.denied`

Microphone not available or refused.

- **English (source):** No problem. Say the words aloud without recording, then tap the arrow when you have finished.
- **isiZulu** (draft): Akunankinga. Sho amagama ngezwi ngaphandle kokuqopha, bese uthinta umcibisholo uma usuqedile.
- **Sesotho** (draft): Ha ho bothata. Bua mantswe ka lentswe ntle le ho rekota, ebe o tobetsa motsu ha o qetile.

## 5. Joining a class and sharing with it

**When:** When the learner enters a class code or scans the class QR code, and in Me > Privacy for each class.

**What is recorded:** `consent_records`: type `cohort_sharing` with the chosen fields as scope; a change of sharing records a new consent and ends the old one at once.

### `join.need_account`

Joining needs an online account first.

- **English (source):** To join a class, first keep your learning on the internet.
- **isiZulu** (draft): Ukuze ujoyine ikilasi, qala ugcine ukufunda kwakho ku-inthanethi.
- **Sesotho** (draft): Ho kena tlelaseng, pele boloka thuto ya hao inthaneteng.

### `share.intro`

Cohort sharing consent 1/4.

- **English (source):** Your teacher's class wants to see your progress. You choose what they may see.
- **isiZulu** (draft): Ikilasi likathisha wakho lifuna ukubona inqubekela phambili yakho. Nguwe okhethayo ukuthi bangabonani.
- **Sesotho** (draft): Tlelase ya titjhere ya hao e batla ho bona tswelopele ya hao. Ke wena ya kgethang hore ba ka bona eng.

### `share.basic`

Cohort sharing: what joining always shares.

- **English (source):** If you join, your teacher will see: your picture, your level, the lessons you have finished, and the last day you practised. They will also see numbers for the whole class about skills that were difficult, without pointing to you.
- **isiZulu** (draft): Uma ujoyina, uthisha wakho uzobona: isithombe sakho, izinga lakho, izifundo oziqedile, nosuku lokugcina oprakthize ngalo. Uzobona nezibalo zekilasi lonke zamakhono abelukhuni, ngaphandle kokukhomba wena.
- **Sesotho** (draft): Ha o kena, titjhere ya hao o tla bona: setshwantsho sa hao, boemo ba hao, dithuto tseo o di qetileng, le letsatsi la ho qetela leo o ikwetlisitseng ka lona. O tla bona le dipalo tsa tlelase yohle tsa bokgoni bo neng bo le thata, ntle le ho o supa.

### `share.mastery`

Cohort sharing: optional mastery with dates (needed for certificates).

- **English (source):** Do you also want the teacher to see the skills you have learned, with the dates? This is needed for a certificate.
- **isiZulu** (draft): Ingabe ufuna nokuthi uthisha abone amakhono owafundile, nezinsuku? Lokhu kuyadingeka ukuze uthole isitifiketi.
- **Sesotho** (draft): Na o batla hape hore titjhere a bone bokgoni boo o ithutileng bona, le matsatsi? Sena se a hlokahala bakeng sa setifikeiti.

### `share.mistakes`

Cohort sharing: optional mistake history.

- **English (source):** Do you want the teacher to see the questions you got wrong, so that they can help you?
- **isiZulu** (draft): Ingabe ufuna uthisha abone imibuzo oyiphosile, ukuze akusize?
- **Sesotho** (draft): Na o batla hore titjhere a bone dipotso tseo o di fositseng, e le hore a o thuse?

### `share.tutor`

Cohort sharing: optional tutor question log.

- **English (source):** Do you want the teacher to see the questions you asked the helper?
- **isiZulu** (draft): Ingabe ufuna uthisha abone imibuzo oyibuze umsizi?
- **Sesotho** (draft): Na o batla hore titjhere a bone dipotso tseo o di botsitseng mothusi?

### `share.confirm`

Confirm joining.

- **English (source):** Join the class.
- **isiZulu** (draft): Joyina ikilasi. Button label: "Joyina ikilasi".
- **Sesotho** (draft): Kena tlelaseng. Button label: "Kena tlelaseng".

### `share.stop_explain`

Before stopping sharing with a class.

- **English (source):** If you stop sharing, your teacher stops seeing your progress straight away.
- **isiZulu** (draft): Uma uyeka ukwabelana, uthisha wakho uzoyeka ngokushesha ukubona inqubekela phambili yakho. Button label: "Yeka ukwabelana".
- **Sesotho** (draft): Ha o emisa ho arolelana, titjhere ya hao o tla emisa hang-hang ho bona tswelopele ya hao. Button label: "Emisa ho arolelana".

### `share.stopped`

After stopping sharing.

- **English (source):** Sharing has stopped.
- **isiZulu** (draft): Ukwabelana kumisiwe.
- **Sesotho** (draft): Ho arolelana ho emisitswe.

## 6. A copy of my information, withdrawing consent, deleting everything

**When:** Me > Privacy.

**What is recorded:** Export: nothing. Withdrawal of online storage and deletion: the learner and everything linked to them is deleted at once (consent records included); `deletion_log` keeps only the time and who started it.

### `me.export`

Download a copy of my data.

- **English (source):** You can get a copy of all the information about you that we keep.
- **isiZulu** (draft): Ungathola ikhophi yayo yonke imininingwane yakho esiyigcinile. Button label: "Ikhophi yemininingwane".
- **Sesotho** (draft): O ka fumana kopi ya dintlha tsohle tsa hao tseo re di bolokileng. Button label: "Kopi ya dintlha".

### `export.done`

Data export ready.

- **English (source):** Your copy is ready.
- **isiZulu** (draft): Ikhophi yakho isilungile.
- **Sesotho** (draft): Kopi ya hao e se e lokile.

### `consent.withdraw`

Withdraw account-storage consent (deletes online data).

- **English (source):** If you withdraw your consent, we will delete your learning from the internet. It will stay on this phone only.
- **isiZulu** (draft): Uma uhoxisa imvume, sizosusa ukufunda kwakho ku-inthanethi. Kuzohlala kule foni kuphela. Button label: "Hoxisa imvume".
- **Sesotho** (draft): Ha o hula tumello, re tla hlakola thuto ya hao inthaneteng. E tla dula founung ena feela. Button label: "Hula tumello".

### `me.delete`

Delete all my data.

- **English (source):** Delete all my information.
- **isiZulu** (draft): Susa yonke imininingwane yami. Button label: "Susa konke".
- **Sesotho** (draft): Hlakola dintlha tsohle tsa ka. Button label: "Hlakola tsohle".

### `delete.explain`

Explain deletion before confirming.

- **English (source):** If you delete, everything about you is removed from this phone and from our system. Your teacher will no longer see you. This cannot be undone. To delete, press and hold the red button.
- **isiZulu** (draft): Uma usula, konke okumayelana nawe kuzosuswa kule foni nasohlelweni lwethu. Uthisha wakho ngeke esakubona. Lokhu akunakuhlehliswa. Ukuze usule, cindezela ubambe inkinobho ebomvu.
- **Sesotho** (draft): Ha o hlakola, tsohle tse mabapi le wena di tla tloswa founung ena le tsamaisong ya rona. Titjhere ya hao a ke ke a hlola a o bona. Sena se ke ke sa kgutliswa. Ho hlakola, tobetsa o tshware konopo e kgubedu.

### `delete.confirm`

Press-and-hold delete button.

- **English (source):** Hold to delete.
- **isiZulu** (draft): Bamba ukuze usule. Button label: "Bamba ukuze usule".
- **Sesotho** (draft): Tshwara ho hlakola. Button label: "Tshwara ho hlakola".

### `delete.done`

After deletion.

- **English (source):** Everything has been deleted. Thank you for learning with us.
- **isiZulu** (draft): Konke kususiwe. Siyabonga ngokufunda nathi.
- **Sesotho** (draft): Tsohle di hlakotswe. Re a leboha ka ho ithuta le rona.

### `delete.offline`

Online deletion needs connectivity.

- **English (source):** Deleting from the internet needs the internet. Try again when you are connected.
- **isiZulu** (draft): Ukususa ku-inthanethi kudinga i-inthanethi. Zama futhi uma usuxhunyiwe.
- **Sesotho** (draft): Ho hlakola inthaneteng ho hloka inthanete. Leka hape ha o hokahane.

## 7. Help from a facilitator on the learner's phone

**When:** When a facilitator signs in on the learner's phone to reset a forgotten code or move the learner to a new phone.

**What is recorded:** `facilitator_assists`: the action and time (included in the learner's data export). The new code is typed by the learner and never shown to the facilitator.

### `assist.handover`

Facilitator-assisted mode starts.

- **English (source):** Your teacher will help you now. Your secret code stays secret.
- **isiZulu** (draft): Uthisha wakho uzokusiza manje. Ikhodi yakho eyimfihlo ihlala iyimfihlo.
- **Sesotho** (draft): Titjhere ya hao o tla o thusa jwale. Khoutu ya hao ya lekunutu e dula e le lekunutu.

### `assist.new_pin`

Learner sets a new PIN during facilitator help.

- **English (source):** Make a new secret code. Your teacher should not look.
- **isiZulu** (draft): Yenza ikhodi entsha eyimfihlo. Uthisha wakho akufanele abuke.
- **Sesotho** (draft): Etsa khoutu e ntjha ya lekunutu. Titjhere ya hao ha a a tlameha ho sheba.
