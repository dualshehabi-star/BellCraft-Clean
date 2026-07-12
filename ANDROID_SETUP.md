# BellCraft — دليل بناء APK خطوة بخطوة

## ما ستحصل عليه
APK يعرض **نفس واجهة الويب تماماً** (Capacitor = WebView يحمّل ملفات محلية داخل APK)  
مع تنبيهات دقيقة عبر `AlarmManager.setExactAndAllowWhileIdle` — تعمل حتى مع قفل الشاشة.

| الميزة | بدون إنترنت | مع إنترنت |
|--------|-------------|-----------|
| فتح التطبيق وعرض الواجهة | ✅ يعمل | ✅ يعمل |
| الجداول والحصص (من DB) | ❌ يحتاج إنترنت | ✅ يعمل |
| تشغيل الجرس (بعد الجدولة) | ✅ يعمل | ✅ يعمل |

---

## وضع البناء: Bundled (محلي)

الملفات مضمّنة داخل APK، والتطبيق يحمّلها من `https://localhost`.  
طلبات API تذهب لـ `VITE_API_BASE_URL` المحدد وقت البناء.

---

## المتطلبات (تثبيت مرة واحدة)

1. **Android Studio** — https://developer.android.com/studio (يشمل JDK + SDK)
2. **Node.js 20+** — https://nodejs.org
3. **pnpm** — `npm install -g pnpm`

---

## خطوات البناء

### 1 — انسخ المشروع محلياً

```bash
git clone <رابط-الريبو>
cd <اسم-المجلد>
pnpm install
```

### 2 — حدد رابط API

#### للإصدار النهائي (مُستحسَن):
انشر التطبيق على Replit أولاً ← ستحصل على رابط مثل:
```
https://bellcraft-YourName.replit.app
```

#### للاختبار فقط:
استخدم رابط Replit Dev (يشترط أن يكون الريبل شغّالاً):
```
https://7fc40c60-f3bf-4e0f-87e8-7c940d63ac90-00-beshdsmvr7oe.pike.replit.dev
```

### 3 — ابنِ ملفات الويب (bundled — بدون server URL)

```bash
cd artifacts/bellcraft

# للإصدار النهائي
PORT=23422 BASE_PATH=/ \
VITE_API_BASE_URL=https://bellcraft-YourName.replit.app \
pnpm run build

# للاختبار
PORT=23422 BASE_PATH=/ \
VITE_API_BASE_URL=https://7fc40c60-f3bf-4e0f-87e8-7c940d63ac90-00-beshdsmvr7oe.pike.replit.dev \
pnpm run build
```

### 4 — مزامنة Capacitor

```bash
# من داخل artifacts/bellcraft
# لا تضع CAPACITOR_SERVER_URL — هذا يجعل APK يحمّل من الملفات المحلية
pnpm run cap-sync
```

### 5 — افتح في Android Studio

```bash
npx cap open android
```

أو: `File → Open` ← اختر مجلد `artifacts/bellcraft/android`

### 6 — ابنِ APK تجريبي

```
Build → Build Bundle(s) / APK(s) → Build APK(s)
```

المسار: `android/app/build/outputs/apk/debug/app-debug.apk`

### 7 — ابنِ APK للإصدار (للتوزيع)

```
Build → Generate Signed Bundle / APK → APK → Next
```

- **Create new...** لإنشاء keystore (احفظ كلمة المرور)
- **Key alias**: bellcraft
- **Validity**: 25 سنة
- اختر **release** → **Finish**

المسار: `android/app/build/outputs/apk/release/app-release.apk`

---

## تثبيت APK على الهاتف

**عبر USB:**
```bash
# فعّل "وضع المطور" و"تصحيح USB" على الهاتف أولاً
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**نقل مباشر:**
انسخ ملف `.apk` للهاتف وافتحه من مدير الملفات.  
(فعّل "السماح بتثبيت تطبيقات من مصادر غير معروفة")

---

## اختبار الجرس بعد التثبيت

1. افتح التطبيق
2. اذهب لـ **إعدادات الجرس** ← فعّل الجرس
3. اقبل إذن الإشعارات عند الطلب
4. اذهب لـ **إعدادات الهاتف ← التطبيقات ← BellCraft ← الإشعارات** ← تأكد التفعيل
5. اضغط زر الاختبار في إعدادات الجرس

---

## عند تحديث الجدول أو الإعدادات

```bash
PORT=23422 BASE_PATH=/ VITE_API_BASE_URL=... pnpm run build
pnpm run cap-sync
# ثم Build APK من Android Studio
```

---

## كيف يعمل الجرس في Android

| الميزة | التفصيل |
|--------|---------|
| آلية التنبيه | `AlarmManager.setExactAndAllowWhileIdle` |
| يعمل مع قفل الشاشة | ✅ |
| يعمل في وضع Doze | ✅ |
| نافذة الجدولة | 14 يوماً مقدماً |
| يرن بدون حصة مُعيّنة | ❌ الخلايا الفارغة لا تُجدوَل |
| يرن في أيام بدون دراسة | ❌ يحترم `activeDays` |
| إعادة الجدولة التلقائية | عند فتح التطبيق + عند استئناف التطبيق |
