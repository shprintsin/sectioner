// The fixture corpus, generated from `projectDefs()` in the design file.
//
// Two projects, four volumes, eleven sections of real Hebrew: responsa from עין יצחק and
// אחיעזר, and two issues of הצפירה. It is the design's own sample text, reproduced
// character for character — the Hebrew was extracted mechanically from the source rather
// than retyped, because a single wrong letter would move every offset after it.
//
// The seeds are declarative: a tag plus the phrase it covers. `resolveSeeds` turns them
// into real annotations by locating each phrase in the text, which is exactly what the
// design does at init. That indirection is why the fixture reads like a description of
// the annotations rather than a table of magic numbers.
//
// This is also the test fixture. SPEC §10 phase 0 wants the data contract proved before
// any UI exists, and these eleven sections already contain everything that is hard:
// gershayim written `''` throughout, three-deep nesting, spans that cross a structural
// boundary, document-scope tags, all three provenances, and both corpora.

import type { Project, Section, Seed, Volume } from "./types";

/** A section as written in the fixture: `text` is derived, never stored twice. */
export type SectionDef = Omit<Section, "text">;
export type VolumeDef = Omit<Volume, "sections"> & { sections: SectionDef[] };
export type ProjectDef = Omit<Project, "volumes"> & { volumes: VolumeDef[] };

/** The separator between paragraphs. Every offset in the fixture depends on it. */
export const SEG_SEP = "\n\n";

export const PROJECT_DEFS: ProjectDef[] = [
  {
    id: "p-responsa",
    name: "שו\"ת ליטא · 1850–1930",
    path: "annotations/shut/project.json",
    corpusLabel: "responsa · booksV2 · 113,401 units",
    tagsetPath: "annotations/shut/tagset.json",
    volumes: [
      {
        id: "v-eyn", title: "עין יצחק", slug: "eynyitzchak",
        sub: "יצחק אלחנן ספקטור · קאוונא · responsa/booksV2/eynyitzchak.csv",
        units: 412, pct: 34, review: 6,
        sections: [
          {
            doc_id: "responsa/eynyitzchak/12866655", part: "אורח חיים", title: "סימן א",
            segs: [
              "בדין יי''ש לפסח שנעשה בחביות חמץ שהוכשרו בהגעלה",
              "ב''ה יום ב' אדר תרנ''ה קאוונא.",
              "לכבוד ידידי הרב הגאון המפורסם מוה''ר אברהם יעקב נ''י אב''ד דק''ק פוזנן, שלום וברכה רבה.",
              "על דבר השאלה אשר שאל מעכ''ת בענין היי''ש הנעשה בבתי היוצר אשר בעירנו, והחביות אשר בהן נשמר היו מלאות שכר חמץ כל ימות השנה, ועתה הוכשרו בהגעלה ברותחין קודם הפסח, אם מותר להשתמש בהן לצורך הפסח. והנה הסוחרים אשר בעיר, רובם ככולם מבני ישראל, נהגו בזה היתר זה שנים רבות, ומחיר החבית הגיע לעשרים וחמשה רו''כ, ואם נאסור עליהם יש כאן הפסד מרובה.",
              "תשובה: הנה מרן הבית יוסף באורח חיים סימן תנ''א כתב דכלי שנשתמש בו חמץ בצונן די לו בהדחה, וכלי שנשתמש בו ברותחין צריך הגעלה. ולפי זה בנדון דידן, החביות אשר בהן שהה השכר מעת לעת, הרי הן ככבוש והוי כמבושל, ובעי הגעלה גמורה.",
              "והעולה מכל האמור: לזה אין אני מסכים כלל להתיר את החביות הללו לפסח, ומכל מקום במקום הפסד מרובה יש לסמוך על המקילין בהגעלה שניה קודם הפסח בשלשים יום.",
              "הכותב וחותם לכבוד התורה, יצחק אלחנן ספקטור, אב''ד דק''ק קאוונא.",
            ],
            seeds: [
              { tag: "topic", q: "בדין יי''ש לפסח שנעשה בחביות חמץ שהוכשרו בהגעלה" },
              { tag: "structure", q: "ב''ה יום ב' אדר תרנ''ה קאוונא.", attrs: {"part":"opener"}, prov: "rule" },
              { tag: "date", q: "יום ב' אדר תרנ''ה", attrs: {"year_he":"תרנ''ה","year_ce":1895,"basis":"dateline"}, prov: "rule" },
              { tag: "place", q: "קאוונא", nth: 1, attrs: {"type":"city","role":"writing_place","ref":"geo:kaunas"} },
              { tag: "structure", q: "לכבוד ידידי הרב הגאון המפורסם מוה''ר אברהם יעקב נ''י אב''ד דק''ק פוזנן, שלום וברכה רבה.", attrs: {"part":"salute"}, prov: "rule" },
              { tag: "person", q: "מוה''ר אברהם יעקב נ''י אב''ד דק''ק פוזנן", attrs: {"role":"recipient","ref":"per:1204"} },
              { tag: "org", q: "דק''ק פוזנן", attrs: {"kind":"community"} },
              { tag: "place", q: "פוזנן", nth: 1, attrs: {"type":"city","role":"residence","ref":"geo:poznan"} },
              { tag: "term", q: "יי''ש", nth: 1, attrs: {"type":"industry","concept":"spirits"}, prov: "agent", status: "proposed", conf: 0.72 },
              { tag: "agent_group", q: "הסוחרים אשר בעיר", attrs: {"kind":"merchants"}, prov: "agent", status: "proposed", conf: 0.81 },
              { tag: "measure", q: "עשרים וחמשה רו''כ", attrs: {"type":"currency","quantity":25,"unit":"רו''כ"}, prov: "agent", status: "proposed", conf: 0.64 },
              { tag: "quote", q: "הבית יוסף באורח חיים סימן תנ''א", attrs: {"source":"Beit Yosef, OC 451"}, prov: "agent", status: "proposed", conf: 0.88 },
              { tag: "ruling", q: "לזה אין אני מסכים כלל", attrs: {"rule":"forbid","intensity":"high","temporal":"present"} },
              { tag: "ruling", q: "יש לסמוך על המקילין בהגעלה שניה קודם הפסח בשלשים יום", attrs: {"rule":"conditional","intensity":"normal"}, prov: "agent", status: "proposed", conf: 0.57 },
              { tag: "structure", q: "הכותב וחותם לכבוד התורה, יצחק אלחנן ספקטור, אב''ד דק''ק קאוונא.", attrs: {"part":"closer"}, prov: "rule" },
              { tag: "person", q: "יצחק אלחנן ספקטור", attrs: {"role":"author","ref":"per:0031"} },
              { tag: "place", q: "קאוונא", nth: 2, attrs: {"type":"city","role":"residence"}, uncertain: true },
              { tag: "doctype", doc: true, attrs: {"value":"responsum"} },
            ],
          },
          {
            doc_id: "responsa/eynyitzchak/12866656", part: "אורח חיים", title: "סימן ב",
            segs: [
              "בענין מקוה שנתמעטו מימיה קודם הטבילה",
              "ב''ה יום ה' ניסן תרנ''ה קאוונא.",
              "שאלה: מקוה אשר בעירנו נתמעטו מימיה ולא נשארו בה אלא עשרים סאה, ובאו אנשי העיר לשאול אם מותר להוסיף עליה מים שאובין בכלי.",
              "תשובה: הנה דבר זה מפורש בשלחן ערוך יורה דעה סימן ר''א, דמים שאובין פוסלין את המקוה בשלשה לוגין. ולכן הנני מתיר להוסיף על ידי המשכה בלבד, ולא בכלי, וכן הורה מורי ורבי זצ''ל.",
            ],
            seeds: [
              { tag: "topic", q: "בענין מקוה שנתמעטו מימיה קודם הטבילה" },
              { tag: "structure", q: "ב''ה יום ה' ניסן תרנ''ה קאוונא.", attrs: {"part":"opener"}, prov: "rule" },
              { tag: "date", q: "יום ה' ניסן תרנ''ה", attrs: {"year_he":"תרנ''ה","year_ce":1895,"basis":"dateline"}, prov: "rule" },
              { tag: "place", q: "קאוונא", nth: 1, attrs: {"type":"city","role":"writing_place","ref":"geo:kaunas"} },
              { tag: "quote", q: "שלחן ערוך יורה דעה סימן ר''א", attrs: {"source":"SA YD 201"}, prov: "agent", status: "proposed", conf: 0.83 },
              { tag: "measure", q: "עשרים סאה", attrs: {"type":"weight","quantity":20,"unit":"סאה"}, prov: "agent", status: "proposed", conf: 0.61 },
              { tag: "ruling", q: "הנני מתיר להוסיף על ידי המשכה בלבד", attrs: {"rule":"permit","intensity":"normal","temporal":"present"} },
              { tag: "doctype", doc: true, attrs: {"value":"responsum"} },
            ],
          },
          {
            doc_id: "responsa/eynyitzchak/12866657", part: "אורח חיים", title: "סימן ג",
            segs: [
              "בדבר בית הכנסת החדש אשר בנו הסוחרים בעיר",
              "ב''ה כ' אייר תרנ''ה קאוונא.",
              "על אודות בית הכנסת אשר בנו אנשי החברה בשוק הגדול, ומחיר הבנין עלה לשלשת אלפים רו''כ, ושואלים אם רשאים למכרו לצורך תלמוד תורה שבעיר.",
              "והנני משיב כי דבר זה תלוי בשבעה טובי העיר במעמד אנשי העיר, וכן כתבו הפוסקים, ואין היחיד רשאי למכור מדעת עצמו.",
            ],
            seeds: [
              { tag: "topic", q: "בדבר בית הכנסת החדש אשר בנו הסוחרים בעיר" },
              { tag: "structure", q: "ב''ה כ' אייר תרנ''ה קאוונא.", attrs: {"part":"opener"}, prov: "rule" },
              { tag: "date", q: "כ' אייר תרנ''ה", attrs: {"year_he":"תרנ''ה","year_ce":1895,"basis":"dateline"}, prov: "rule" },
              { tag: "agent_group", q: "אנשי החברה", attrs: {"kind":"guild"}, prov: "agent", status: "proposed", conf: 0.66 },
              { tag: "measure", q: "שלשת אלפים רו''כ", attrs: {"type":"currency","quantity":3000,"unit":"רו''כ"}, prov: "agent", status: "proposed", conf: 0.79 },
              { tag: "org", q: "תלמוד תורה", attrs: {"kind":"community"} },
              { tag: "ruling", q: "דבר זה תלוי בשבעה טובי העיר במעמד אנשי העיר", attrs: {"rule":"conditional","intensity":"normal","temporal":"present"} },
              { tag: "doctype", doc: true, attrs: {"value":"responsum"} },
            ],
          },
          {
            doc_id: "responsa/eynyitzchak/12866801", part: "יורה דעה", title: "סימן א",
            segs: [
              "בשאלת הכשר הבשר הבא מן העיר הסמוכה",
              "ב''ה ר''ח סיון תרנ''ו קאוונא.",
              "שאלה מאת הרב מוה''ר שמואל דוד נ''י אב''ד דק''ק ווילקאמיר, על אודות הבשר הנשלח מעירו לעירנו על ידי הסוחרים, אם צריך שומר בדרך.",
              "תשובה: לדעתי אין להקל בזה כלל, וצריך שומר ישראל כל הדרך, ומי שאינו עושה כן הרי זה מכשיל את הרבים.",
            ],
            seeds: [
              { tag: "topic", q: "בשאלת הכשר הבשר הבא מן העיר הסמוכה" },
              { tag: "structure", q: "ב''ה ר''ח סיון תרנ''ו קאוונא.", attrs: {"part":"opener"}, prov: "rule" },
              { tag: "date", q: "ר''ח סיון תרנ''ו", attrs: {"year_he":"תרנ''ו","year_ce":1896,"basis":"dateline"}, prov: "rule" },
              { tag: "person", q: "מוה''ר שמואל דוד נ''י", attrs: {"role":"recipient"} },
              { tag: "place", q: "ווילקאמיר", attrs: {"type":"city","role":"residence"}, uncertain: true },
              { tag: "agent_group", q: "הסוחרים", attrs: {"kind":"merchants"}, prov: "agent", status: "proposed", conf: 0.54 },
              { tag: "ruling", q: "אין להקל בזה כלל", attrs: {"rule":"forbid","intensity":"high","temporal":"present"} },
              { tag: "doctype", doc: true, attrs: {"value":"responsum"} },
            ],
          },
        ],
      },
      {
        id: "v-ach", title: "אחיעזר", slug: "achiezer",
        sub: "חיים עוזר גרודזנסקי · ווילנא · responsa/booksV2/achiezer.csv",
        units: 318, pct: 12, review: 2,
        sections: [
          {
            doc_id: "responsa/achiezer/44120012", part: "חלק א", title: "סימן יב",
            segs: [
              "בענין היתר עסקא בין שני שותפים",
              "ב''ה ט' כסלו תרפ''ב ווילנא.",
              "שאלה: שני שותפים אשר עשו ביניהם שטר עסקא, ואחד מהם נותן המעות והשני עוסק בהן, ובאו לשאול אם צריך לקצוב שכר עמלו בפירוש.",
              "תשובה: כבר האריכו בזה הפוסקים, ולדעתי מותר לכתחלה בתנאי שיקצוב שכר עמלו, ובלא זה יש בו חשש רבית.",
            ],
            seeds: [
              { tag: "topic", q: "בענין היתר עסקא בין שני שותפים" },
              { tag: "structure", q: "ב''ה ט' כסלו תרפ''ב ווילנא.", attrs: {"part":"opener"}, prov: "rule" },
              { tag: "date", q: "ט' כסלו תרפ''ב", attrs: {"year_he":"תרפ''ב","year_ce":1921,"basis":"dateline"}, prov: "rule" },
              { tag: "place", q: "ווילנא", nth: 1, attrs: {"type":"city","role":"writing_place","ref":"geo:vilna"} },
              { tag: "term", q: "שטר עסקא", attrs: {"type":"commercial","concept":"heter_iska"}, prov: "agent", status: "proposed", conf: 0.77 },
              { tag: "ruling", q: "מותר לכתחלה בתנאי שיקצוב שכר עמלו", attrs: {"rule":"conditional","intensity":"normal","temporal":"present"} },
              { tag: "doctype", doc: true, attrs: {"value":"responsum"} },
            ],
          },
          {
            doc_id: "responsa/achiezer/44120013", part: "חלק א", title: "סימן יג",
            segs: [
              "בדבר בית הדפוס אשר בעיר ומכירת ספרים בשבת",
              "ב''ה כ''ה טבת תרפ''ב ווילנא.",
              "על אודות בעל בית הדפוס אשר בעירנו המוכר ספריו על ידי גוי בשבת, ומחיר הספר שני זהובים.",
              "והנני אוסר את הדבר, אלא אם כן ימכור בהקפה קודם השבת.",
            ],
            seeds: [
              { tag: "topic", q: "בדבר בית הדפוס אשר בעיר ומכירת ספרים בשבת" },
              { tag: "structure", q: "ב''ה כ''ה טבת תרפ''ב ווילנא.", attrs: {"part":"opener"}, prov: "rule" },
              { tag: "date", q: "כ''ה טבת תרפ''ב", attrs: {"year_he":"תרפ''ב","year_ce":1922,"basis":"dateline"}, prov: "rule" },
              { tag: "place", q: "ווילנא", nth: 1, attrs: {"type":"city","role":"writing_place","ref":"geo:vilna"} },
              { tag: "measure", q: "שני זהובים", attrs: {"type":"currency","quantity":2,"unit":"זהובים"}, prov: "agent", status: "proposed", conf: 0.58 },
              { tag: "ruling", q: "הנני אוסר את הדבר", attrs: {"rule":"forbid","intensity":"normal","temporal":"present"} },
              { tag: "doctype", doc: true, attrs: {"value":"responsum"} },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "p-press",
    name: "עיתונות יהודית · הצפירה",
    path: "annotations/press/project.json",
    corpusLabel: "nli-press · structured · issue → section → block",
    tagsetPath: "annotations/press/tagset.json",
    volumes: [
      {
        id: "v-hmz24", title: "הצפירה · 24 במאי 1903", slug: "hmz19030524",
        sub: "nli-press/structured/hmz19030524-01.json",
        units: 14, pct: 21, review: 1,
        sections: [
          {
            doc_id: "nli-press/hmz19030524-01/sec-3", part: "עמוד 1", title: "מודעות מסחריות",
            segs: [
              "הצפירה — ורשה, יום ה' כ''ד אייר תרס''ג",
              "בית המסחר לבדים ולמנופקטורה של ה' יעקב ראזענבערג בורשה, רחוב נאלעווקי 23, מודיע בזה לכבוד קהל הסוחרים כי קבל סחורה חדשה מבתי החרושת אשר בלאדז ובביאליסטוק.",
              "מחיר הארשין מן 45 קאפ' ולמעלה. ההזמנות מן הערים תשלחנה תיכף בקבלת המכתב.",
            ],
            seeds: [
              { tag: "masthead", q: "הצפירה — ורשה, יום ה' כ''ד אייר תרס''ג", prov: "rule" },
              { tag: "place", q: "ורשה", nth: 1, attrs: {"type":"city","role":"writing_place","ref":"geo:warsaw"} },
              { tag: "date", q: "יום ה' כ''ד אייר תרס''ג", attrs: {"year_he":"תרס''ג","year_ce":1903,"basis":"dateline"}, prov: "rule" },
              { tag: "advertisement", from: "בית המסחר לבדים ולמנופקטורה של ה' יעקב ראזענבערג בורשה, רחוב נאלעווקי 23, מודיע בזה לכבוד קהל הסוחרים כי קבל סחורה חדשה מבתי החרושת אשר בלאדז ובביאליסטוק.", to: "מחיר הארשין מן 45 קאפ' ולמעלה. ההזמנות מן הערים תשלחנה תיכף בקבלת המכתב.", attrs: {"kind":"commercial"} },
              { tag: "person", q: "יעקב ראזענבערג", attrs: {"role":"mentioned"} },
              { tag: "term", q: "מנופקטורה", attrs: {"type":"industry","concept":"textiles"}, prov: "agent", status: "proposed", conf: 0.69 },
              { tag: "place", q: "לאדז", attrs: {"type":"city","role":"mentioned","ref":"geo:lodz"} },
              { tag: "place", q: "ביאליסטוק", attrs: {"type":"city","role":"mentioned"} },
              { tag: "price", q: "45 קאפ'", attrs: {"currency":"kop","amount":45}, prov: "agent", status: "proposed", conf: 0.74 },
              { tag: "doctype", doc: true, attrs: {"value":"advertisement"} },
            ],
          },
          {
            doc_id: "nli-press/hmz19030524-01/sec-4", part: "עמוד 1", title: "ידיעות מן העיר",
            segs: [
              "ידיעות מן העיר. אתמול נאספו ראשי הקהלה בבית הועד לדבר על אודות הקופה לגמילות חסדים ועל דבר תמיכת בתי הספר לבני העניים.",
              "בית החולים אשר ברחוב טווארדא קבל מתנה מאת ה' מרדכי גינזבורג סך אלף רו''כ.",
            ],
            seeds: [
              { tag: "org", q: "ראשי הקהלה", attrs: {"kind":"community"}, prov: "agent", status: "proposed", conf: 0.52 },
              { tag: "org", q: "הקופה לגמילות חסדים", attrs: {"kind":"community"} },
              { tag: "person", q: "מרדכי גינזבורג", attrs: {"role":"mentioned"} },
              { tag: "measure", q: "אלף רו''כ", attrs: {"type":"currency","quantity":1000,"unit":"רו''כ"}, prov: "agent", status: "proposed", conf: 0.71 },
              { tag: "doctype", doc: true, attrs: {"value":"news"} },
            ],
          },
          {
            doc_id: "nli-press/hmz19030524-01/sec-7", part: "עמוד 2", title: "מכתבים מן הערים",
            segs: [
              "מווילנא כותבים לנו כי אספת הסוחרים אשר היתה בשבוע העבר החליטה לשלוח באי כח אל הועידה בפטרבורג.",
            ],
            seeds: [
              { tag: "place", q: "מווילנא", attrs: {"type":"city","role":"mentioned"} },
              { tag: "agent_group", q: "אספת הסוחרים", attrs: {"kind":"merchants"}, prov: "agent", status: "proposed", conf: 0.63 },
              { tag: "place", q: "בפטרבורג", attrs: {"type":"city","role":"mentioned"}, uncertain: true },
              { tag: "doctype", doc: true, attrs: {"value":"news"} },
            ],
          },
        ],
      },
      {
        id: "v-hmz25", title: "הצפירה · 25 במאי 1903", slug: "hmz19030525",
        sub: "nli-press/structured/hmz19030525-01.json",
        units: 11, pct: 8, review: 0,
        sections: [
          {
            doc_id: "nli-press/hmz19030525-01/sec-2", part: "עמוד 1", title: "מודעות",
            segs: [
              "הצפירה — ורשה, יום ו' כ''ה אייר תרס''ג",
              "בית החרושת לסוכר של האחים אפשטיין בורשה מודיע כי החל למכור סוכר במחיר שלשה רו''כ לפוד, וההזמנות מתקבלות בכל יום.",
            ],
            seeds: [
              { tag: "masthead", q: "הצפירה — ורשה, יום ו' כ''ה אייר תרס''ג", prov: "rule" },
              { tag: "date", q: "יום ו' כ''ה אייר תרס''ג", attrs: {"year_he":"תרס''ג","year_ce":1903,"basis":"dateline"}, prov: "rule" },
              { tag: "org", q: "האחים אפשטיין", attrs: {"kind":"firm"}, prov: "agent", status: "proposed", conf: 0.6 },
              { tag: "price", q: "שלשה רו''כ לפוד", attrs: {"currency":"rub","amount":3}, prov: "agent", status: "proposed", conf: 0.66 },
              { tag: "doctype", doc: true, attrs: {"value":"advertisement"} },
            ],
          },
          {
            doc_id: "nli-press/hmz19030525-01/sec-5", part: "עמוד 2", title: "ידיעות",
            segs: [
              "בעיר מינסק נוסדה אגודת הסוחרים אשר תדאג לעניני המסחר בעיר ולתמיכת החנונים הקטנים.",
              "בית הספר לבנות אשר ברחוב גזשיבאווסקא קבל רשיון מאת הממשלה ללמד גם למודי חול.",
            ],
            seeds: [
              { tag: "place", q: "מינסק", attrs: {"type":"city","role":"mentioned"} },
              { tag: "agent_group", q: "אגודת הסוחרים", attrs: {"kind":"merchants"}, prov: "agent", status: "proposed", conf: 0.7 },
              { tag: "org", q: "בית הספר לבנות", attrs: {"kind":"community"} },
              { tag: "doctype", doc: true, attrs: {"value":"news"} },
            ],
          },
        ],
      },
    ],
  },
];

/** Add the derived `text` to a section: `segs.join(SEG_SEP)`, as the design's `s()` does. */
export function withText(def: SectionDef): Section {
  return { ...def, text: def.segs.join(SEG_SEP) };
}

/** The fixture corpus with every section's text materialised. Pure and deterministic. */
export const PROJECTS: Project[] = PROJECT_DEFS.map((p) => ({
  ...p,
  volumes: p.volumes.map((v) => ({ ...v, sections: v.sections.map(withText) })),
}));

/** Every section in a project, flattened, in volume then section order. */
export function allSections(project: Project): Section[] {
  return project.volumes.flatMap((v) => v.sections);
}

/** All seeds in the fixture, paired with the section they belong to. */
export function allSeeds(projects: Project[]): { sec: Section; seed: Seed }[] {
  return projects.flatMap((p) =>
    allSections(p).flatMap((sec) => sec.seeds.map((seed) => ({ sec, seed }))),
  );
}
