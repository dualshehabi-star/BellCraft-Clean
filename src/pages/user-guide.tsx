import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Bell,
  CalendarDays,
  BookOpen,
  Settings,
  Volume2,
  BellOff,
  Palmtree,
  Timer,
  Share2,
  HelpCircle,
  Info,
  ChevronLeft,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface GuideItem {
  q: string;
  a: React.ReactNode;
}

interface GuideSection {
  id: string;
  icon: React.ReactNode;
  title: string;
  color: string;
  bg: string;
  items: GuideItem[];
}

// ── Guide content ─────────────────────────────────────────────────────────────

const SECTIONS: GuideSection[] = [
  {
    id: "about",
    icon: <Info className="w-4 h-4" />,
    title: "نبذة عن التطبيق",
    color: "text-blue-700",
    bg: "bg-blue-50",
    items: [
      {
        q: "ما هو BellCraft؟",
        a: (
          <>
            BellCraft تطبيق ذكي لإدارة الجداول الدراسية وتشغيل جرس الحصص تلقائيًا.
            يتيح لك إنشاء جداول متعددة، وإضافة المواد، وتحديد أوقات كل حصة،
            ثم يُنبّهك تلقائيًا قبل بدء كل حصة أو عند انتهائها.
          </>
        ),
      },
      {
        q: "ما الفرق بين نسخة المتصفح وتطبيق الأندرويد؟",
        a: (
          <>
            <b>المتصفح:</b> يعمل الجرس طالما التطبيق مفتوح في نافذة المتصفح.
            <br />
            <b>تطبيق الأندرويد (APK):</b> يرن الجرس حتى لو أُغلق التطبيق أو قُفلت الشاشة،
            لأنه يستخدم تنبيهات النظام المحلية.
          </>
        ),
      },
    ],
  },
  {
    id: "schedules",
    icon: <CalendarDays className="w-4 h-4" />,
    title: "الجداول الدراسية",
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    items: [
      {
        q: "كيف أنشئ جدولًا جديدًا؟",
        a: (
          <>
            ١. اضغط على تبويب <b>الجداول</b> من الشريط السفلي.
            <br />
            ٢. اضغط على زر <b>+ جدول جديد</b>.
            <br />
            ٣. أدخل اسم الجدول واختر أيام الدراسة، ثم احفظ.
          </>
        ),
      },
      {
        q: "كيف أُعدّل جدولًا موجودًا؟",
        a: (
          <>
            من صفحة الجداول اضغط على الجدول المطلوب، ثم اضغط على أيقونة
            التعديل (القلم) لتغيير الاسم أو الأيام.
          </>
        ),
      },
      {
        q: "كيف أنسخ جدولًا؟",
        a: (
          <>
            افتح الجدول، ثم اضغط على <b>نسخ الجدول</b> من قائمة الخيارات.
            سيُنشأ جدول جديد بنفس الحصص والمواد.
          </>
        ),
      },
      {
        q: "كيف أحذف جدولًا؟",
        a: (
          <>
            افتح الجدول، ثم اضغط على <b>حذف الجدول</b>. سيُطلب منك تأكيد الحذف.
            لا يمكن التراجع عن هذه الخطوة.
          </>
        ),
      },
      {
        q: "كيف أُفعّل جدولًا معينًا؟",
        a: (
          <>
            من صفحة الجداول اضغط على زر <b>تفعيل</b> بجانب الجدول المطلوب.
            سيظهر الجدول المُفعَّل في الصفحة الرئيسية ويعمل منه الجرس.
          </>
        ),
      },
    ],
  },
  {
    id: "periods",
    icon: <Timer className="w-4 h-4" />,
    title: "الحصص والتوقيتات",
    color: "text-violet-700",
    bg: "bg-violet-50",
    items: [
      {
        q: "كيف أُضيف حصصًا للجدول؟",
        a: (
          <>
            ١. افتح الجدول من صفحة الجداول.
            <br />
            ٢. اختر <b>الإعداد التلقائي</b> لإدخال عدد الحصص وفترة الاستراحة،
            أو <b>الإعداد اليدوي</b> لإدخال وقت بدء وانتهاء كل حصة منفردةً.
            <br />
            ٣. اضغط <b>حفظ</b> بعد الانتهاء.
          </>
        ),
      },
      {
        q: "كيف أُعدّل وقت حصة معينة؟",
        a: (
          <>
            افتح الجدول، ثم اضغط على الحصة لتعديل وقت بدايتها أو نهايتها
            أو اسم المادة المرتبطة بها.
          </>
        ),
      },
      {
        q: "ما معنى تنبيه ما قبل الحصة؟",
        a: (
          <>
            هو تنبيه يصدر قبل بدء الحصة بعدد الدقائق الذي تحدده.
            مثلًا: إذا ضبطته على ٥ دقائق سيرن الجرس قبل بداية كل حصة بـ ٥ دقائق.
          </>
        ),
      },
    ],
  },
  {
    id: "subjects",
    icon: <BookOpen className="w-4 h-4" />,
    title: "المواد الدراسية",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    items: [
      {
        q: "كيف أُضيف مادة دراسية؟",
        a: (
          <>
            ١. من تبويب <b>الإعدادات</b> اضغط على <b>المواد الدراسية</b>.
            <br />
            ٢. اضغط <b>+ إضافة مادة</b>.
            <br />
            ٣. أدخل اسم المادة واختر لونها، ثم احفظ.
          </>
        ),
      },
      {
        q: "كيف أُعيّن مادة لحصة معينة؟",
        a: (
          <>
            عند تعديل الحصة داخل الجدول، اضغط على حقل <b>المادة</b>
            واختر المادة من القائمة.
          </>
        ),
      },
      {
        q: "هل يمكن حذف مادة؟",
        a: (
          <>
            نعم، من صفحة المواد الدراسية اضغط على المادة واختر <b>حذف</b>.
            الحصص المرتبطة بها لن تُحذف، لكن اسم المادة سيُزال منها.
          </>
        ),
      },
    ],
  },
  {
    id: "bell",
    icon: <Bell className="w-4 h-4" />,
    title: "إعدادات الجرس والتنبيهات",
    color: "text-amber-700",
    bg: "bg-amber-50",
    items: [
      {
        q: "كيف أصل إلى إعدادات الجرس؟",
        a: (
          <>
            من تبويب <b>الإعدادات</b> اضغط على <b>إعدادات الجرس</b>.
          </>
        ),
      },
      {
        q: "ما معنى خيار «الجرس التلقائي»؟",
        a: (
          <>
            عند تفعيله يرن الجرس تلقائيًا عند بدء كل حصة حسب جدولك النشط.
            عند تعطيله لا يصدر أي صوت حتى وإن كان التطبيق مفتوحًا.
          </>
        ),
      },
      {
        q: "كيف أختار نغمة الجرس وأختبرها؟",
        a: (
          <>
            في إعدادات الجرس اضغط على <b>نغمة الجرس</b>، واختر من
            القائمة (كلاسيك، رقمي، لطيف…)، ثم اضغط <b>تجربة</b>
            للاستماع إليها مباشرةً.
          </>
        ),
      },
      {
        q: "كيف أضبط مستوى الصوت؟",
        a: (
          <>
            في إعدادات الجرس حرّك شريط <b>مستوى الصوت</b>.
            يمكنك أيضًا تفعيل <b>أعلى صوت ممكن</b> لتجاوز إعداد صوت الجهاز.
          </>
        ),
      },
      {
        q: "ما خيار «مدة الرنين»؟",
        a: (
          <>
            يحدد كم ثانية يستمر صوت الجرس في كل مرة يرن فيها.
            القيمة الافتراضية ٦ ثوانٍ.
          </>
        ),
      },
      {
        q: "ما الفرق بين تنبيه بداية الحصة وتنبيه نهايتها؟",
        a: (
          <>
            <b>تنبيه ما قبل الحصة:</b> يرن قبل بداية الحصة بالدقائق التي تحددها.
            <br />
            <b>تنبيه نهاية الحصة:</b> يرن عند انتهاء الحصة مباشرةً.
            <br />
            يمكن تفعيل أو تعطيل كل منهما بشكل مستقل.
          </>
        ),
      },
      {
        q: "كيف أُفعّل تنبيهًا أو أُعطّله؟",
        a: (
          <>
            في إعدادات الجرس ستجد مفاتيح تبديل (Toggle) لكل نوع تنبيه.
            اضغط عليها لتفعيلها (أزرق) أو تعطيلها (رمادي).
          </>
        ),
      },
      {
        q: "ما هو «تنبيه فرضي» أو «Duty Alert»؟",
        a: (
          <>
            تنبيه مستقل غير مرتبط بجدول الحصص. يمكنك ضبطه ليرن في أوقات
            محددة كالإشراف أو الاجتماعات.
          </>
        ),
      },
    ],
  },
  {
    id: "vacation",
    icon: <Palmtree className="w-4 h-4" />,
    title: "وضع الإجازة",
    color: "text-teal-700",
    bg: "bg-teal-50",
    items: [
      {
        q: "ما هو وضع الإجازة؟",
        a: (
          <>
            عند تفعيله يتوقف الجرس عن الرنين تمامًا حتى تُعيد تعطيله،
            دون الحاجة إلى تغيير أي إعداد آخر.
          </>
        ),
      },
      {
        q: "كيف أُفعّل وضع الإجازة؟",
        a: (
          <>
            في إعدادات الجرس فعّل مفتاح <b>وضع الإجازة</b>.
            ستظهر علامة واضحة تُشير إلى أن الجرس متوقف.
          </>
        ),
      },
    ],
  },
  {
    id: "dashboard",
    icon: <Timer className="w-4 h-4" />,
    title: "الصفحة الرئيسية والعد التنازلي",
    color: "text-blue-700",
    bg: "bg-blue-50",
    items: [
      {
        q: "ما المعلومات التي تظهر في الصفحة الرئيسية؟",
        a: (
          <>
            • <b>اسم الجدول النشط</b> والتاريخ الحالي.
            <br />
            • <b>الحصة الحالية</b>: اسم المادة ووقت بدايتها ونهايتها.
            <br />
            • <b>العد التنازلي</b>: الوقت المتبقي حتى انتهاء الحصة الحالية.
            <br />
            • <b>الحصة القادمة</b>: اسمها ووقت بدايتها.
            <br />
            • <b>الجدول الأسبوعي</b>: نظرة عامة على جدول اليوم.
          </>
        ),
      },
      {
        q: "ماذا يعني العد التنازلي؟",
        a: (
          <>
            يُظهر الوقت المتبقي حتى انتهاء الحصة الجارية لحظةً بلحظة.
            عندما تنتهي الحصة الحالية يتحول تلقائيًا للعد حتى بداية الحصة القادمة.
          </>
        ),
      },
      {
        q: "ماذا يحدث إذا لم يكن هناك جدول نشط؟",
        a: (
          <>
            ستظهر رسالة تطلب منك تفعيل جدول أو إنشاء جدول جديد.
            يمكنك الانتقال مباشرةً إلى صفحة الجداول من الرابط الظاهر.
          </>
        ),
      },
    ],
  },
  {
    id: "export",
    icon: <Share2 className="w-4 h-4" />,
    title: "حفظ الجدول ومشاركته",
    color: "text-pink-700",
    bg: "bg-pink-50",
    items: [
      {
        q: "كيف أُصدّر الجدول كصورة؟",
        a: (
          <>
            في الصفحة الرئيسية اضغط على أيقونة <b>تنزيل</b> (السهم للأسفل).
            ستُحفظ صورة PNG للجدول في مجلد التنزيلات.
          </>
        ),
      },
      {
        q: "كيف أُشارك الجدول مع الآخرين؟",
        a: (
          <>
            اضغط على أيقونة <b>مشاركة</b> (السهم للأعلى) في الصفحة الرئيسية.
            سيفتح نظام المشاركة في جهازك ويمكنك إرسال الصورة عبر أي تطبيق.
          </>
        ),
      },
    ],
  },
  {
    id: "faq",
    icon: <HelpCircle className="w-4 h-4" />,
    title: "الأسئلة الشائعة وحل المشكلات",
    color: "text-rose-700",
    bg: "bg-rose-50",
    items: [
      {
        q: "الجرس لا يرن، ما السبب؟",
        a: (
          <>
            • تأكد أن الجرس مُفعَّل من تبويب <b>الإعدادات</b>.
            <br />
            • تأكد أن <b>وضع الإجازة</b> غير مُفعَّل.
            <br />
            • تأكد أن الجدول النشط يحتوي على حصص لليوم الحالي.
            <br />
            • في المتصفح: تأكد أن نافذة التطبيق مفتوحة وغير مُخفاة.
            <br />
            • في الأندرويد: تأكد من منح إذن الإنذارات والتنبيهات.
          </>
        ),
      },
      {
        q: "كيف أمنح إذن الإنذارات على الأندرويد؟",
        a: (
          <>
            ١. الإعدادات ← التطبيقات ← BellCraft ← الأذونات.
            <br />
            ٢. فعّل إذن <b>الإنذارات والتذكيرات</b>.
            <br />
            ٣. من الإعدادات ← البطارية ← BellCraft ← اختر <b>غير محظور</b>.
          </>
        ),
      },
      {
        q: "التطبيق لا يعرض الجدول الصحيح.",
        a: (
          <>
            تأكد أنك فعّلت الجدول الصحيح من صفحة <b>الجداول</b>.
            الجدول المُفعَّل يُميَّز بعلامة خضراء.
          </>
        ),
      },
      {
        q: "كيف أُغيّر الجدول النشط؟",
        a: (
          <>
            انتقل إلى صفحة <b>الجداول</b>، واضغط على زر <b>تفعيل</b>
            بجانب الجدول الذي تريده. يمكن أن يكون جدول واحد فقط نشطًا في نفس الوقت.
          </>
        ),
      },
      {
        q: "هل يمكن استخدام أكثر من جدول في نفس الوقت؟",
        a: (
          <>
            لا، يمكن تفعيل جدول واحد فقط في كل مرة. لكن يمكنك إنشاء
            عدة جداول والتبديل بينها بسهولة (مثلًا: جدول الفصل الأول وجدول الفصل الثاني).
          </>
        ),
      },
      {
        q: "الصفحة لا تتحدث تلقائيًا.",
        a: (
          <>
            الصفحة الرئيسية تتحدث كل ثانية تلقائيًا. إذا توقفت عن التحديث
            أعد تحميل التطبيق أو أغلق وافتح مرة أخرى.
          </>
        ),
      },
    ],
  },
];

// ── Components ────────────────────────────────────────────────────────────────

function AccordionItem({ item, isLast }: { item: GuideItem; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={!isLast ? "border-b border-slate-100" : ""}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-3 gap-3 text-right tap"
      >
        <span className="text-[13px] font-bold text-slate-800 leading-snug flex-1">{item.q}</span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-slate-400"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="text-[12.5px] text-slate-600 leading-relaxed pb-3.5">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionCard({ section }: { section: GuideSection }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 tap"
      >
        <span className={`w-9 h-9 rounded-xl ${section.bg} flex items-center justify-center shrink-0 ${section.color}`}>
          {section.icon}
        </span>
        <span className="flex-1 text-sm font-extrabold text-slate-900 text-right">{section.title}</span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-slate-400 shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-2">
              {section.items.map((item, i) => (
                <AccordionItem key={i} item={item} isLast={i === section.items.length - 1} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UserGuide() {
  const [, navigate] = useLocation();
  return (
    <div className="space-y-4 pb-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/settings")}
          className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center tap shrink-0"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">دليل الاستخدام</h1>
          <p className="text-[11px] text-slate-500">شرح شامل لجميع وظائف التطبيق</p>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <SectionCard key={section.id} section={section} />
      ))}

      <p className="text-center text-[11px] text-slate-400 pt-2">
        لإضافة اقتراح أو الإبلاغ عن مشكلة، تواصل مع مطور التطبيق 💙
      </p>
    </div>
  );
}
