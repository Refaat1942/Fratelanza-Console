/**
 * Fratelanza service packages (from the company service profiles).
 * Prices are starting/guide prices; the final price depends on the agreed scope.
 * Each feature has a one-line explanation used in the technical proposal.
 */

export type Tier = "starter" | "business" | "enterprise";
export const TIERS: Tier[] = ["starter", "business", "enterprise"];
export const TIER_NAME: Record<Tier, string> = { starter: "Starter", business: "Business", enterprise: "Enterprise" };

export type Bi = { ar: string; en: string };
export type Feature = { ar: string; en: string; dAr: string; dEn: string };
export type ServicePackage = { tier: Tier; price: number; features: Feature[] };
export type Service = {
  key: string;
  name: Bi;
  tagline: Bi;
  /** What the solution does for the client's business (tailored with the client's activity) */
  benefits: Bi[];
  scopeNote: Bi;
  packages: ServicePackage[];
};

const f = (ar: string, en: string, dAr: string, dEn: string): Feature => ({ ar, en, dAr, dEn });

export const SERVICES: Service[] = [
  {
    key: "websites",
    name: { ar: "المواقع الإلكترونية", en: "Websites" },
    tagline: { ar: "موقع احترافي يعكس هوية شركتك ويساعدك على النمو", en: "A professional website that reflects your brand and helps you grow" },
    benefits: [
      { ar: "حضور رقمي احترافي يعزز ثقة العملاء في {biz}", en: "A professional online presence that builds customer trust in {biz}" },
      { ar: "استقبال طلبات واستفسارات العملاء على مدار الساعة", en: "Receive customer enquiries and requests around the clock" },
      { ar: "الظهور في نتائج البحث والوصول إلى عملاء جدد", en: "Be found in search results and reach new customers" },
    ],
    scopeNote: { ar: "يُحدد عدد الصفحات والخصائص والتكاملات النهائية في العرض الفني.", en: "The final number of pages, features and integrations is set in the technical proposal." },
    packages: [
      { tier: "starter", price: 16000, features: [
        f("موقع تعريفي حتى 5 صفحات", "Company website up to 5 pages", "صفحات مثل: الرئيسية، من نحن، الخدمات، أعمالنا، تواصل معنا، بتصميم متجاوب مع الجوال.", "Pages such as Home, About, Services, Portfolio and Contact, responsive on mobile."),
        f("نموذج تواصل", "Contact form", "نموذج يرسل رسائل العملاء مباشرة إلى بريدكم الإلكتروني مع حماية من الرسائل المزعجة.", "A form that sends customer messages straight to your email, with spam protection."),
        f("تهيئة أساسية لمحركات البحث", "Basic SEO setup", "عناوين ووصف للصفحات وخريطة الموقع وربط Google Search Console.", "Page titles and descriptions, sitemap and Google Search Console setup."),
      ] },
      { tier: "business", price: 32000, features: [
        f("موقع حتى 15 صفحة", "Website up to 15 pages", "مساحة أكبر لعرض الخدمات والمنتجات والمشروعات والأخبار بالتفصيل.", "More room to present services, products, projects and news in detail."),
        f("لوحة تحكم للمحتوى", "Content management dashboard", "تعديل النصوص والصور وإضافة صفحات وأخبار بأنفسكم دون الحاجة لمبرمج.", "Edit text and images and add pages and news yourselves, without a developer."),
        f("ربط وسائل التواصل", "Social media integration", "روابط وأزرار مشاركة وعرض محتوى حساباتكم على وسائل التواصل داخل الموقع.", "Links, share buttons and your social media content shown on the site."),
        f("دعم تعدد اللغات", "Multi-language support", "نسخة عربية وإنجليزية (أو لغات أخرى) مع تبديل سهل بين اللغات.", "Arabic and English (or other languages) with easy switching."),
      ] },
      { tier: "enterprise", price: 56000, features: [
        f("موقع مخصص ومتقدم", "Custom advanced website", "تصميم واجهات خاص بهويتكم وتجربة مستخدم مدروسة لكل صفحة.", "Interface design made for your brand and a carefully planned user experience."),
        f("تصميم متجاوب مع الأجهزة", "Responsive design for all devices", "عرض مثالي على الجوال والتابلت والكمبيوتر مع سرعة تحميل عالية.", "Displays perfectly on mobile, tablet and desktop, with fast loading."),
        f("خصائص وتكاملات حسب النطاق", "Features and integrations per scope", "حجوزات، نماذج متقدمة، ربط أنظمة CRM أو بوابات دفع وغيرها حسب المتفق عليه.", "Bookings, advanced forms, CRM or payment gateway links and more, as agreed."),
        f("قابلية للتوسع والتطوير", "Scalable and extendable", "بنية برمجية تسمح بإضافة أقسام وخصائص جديدة مستقبلاً بسهولة.", "A code structure that makes adding new sections and features easy later."),
      ] },
    ],
  },
  {
    key: "mobile_apps",
    name: { ar: "تطبيقات الهواتف الذكية", en: "Mobile Applications" },
    tagline: { ar: "تطبيقات احترافية للهواتف الذكية", en: "Professional smartphone applications" },
    benefits: [
      { ar: "وصول مباشر لعملاء {biz} من هواتفهم في أي وقت", en: "Reach {biz} customers directly on their phones, any time" },
      { ar: "إشعارات فورية تزيد التفاعل وتكرار الطلب", en: "Push notifications that increase engagement and repeat business" },
      { ar: "تجربة استخدام سريعة تعزز ولاء العملاء", en: "A fast experience that builds customer loyalty" },
    ],
    scopeNote: { ar: "تُحدد المنصات (Android / iOS) والخصائص والتكاملات وفق نطاق المشروع.", en: "Platforms (Android / iOS), features and integrations are set by the project scope." },
    packages: [
      { tier: "starter", price: 48000, features: [
        f("تطبيق بخصائص أساسية", "App with core features", "تسجيل دخول، عرض المحتوى أو المنتجات، ونموذج طلب أو تواصل.", "Sign-in, content or product listing, and a request or contact form."),
        f("لوحة تحكم أساسية", "Basic admin dashboard", "لوحة ويب لإدارة محتوى التطبيق والمستخدمين والطلبات.", "A web dashboard to manage app content, users and requests."),
      ] },
      { tier: "business", price: 80000, features: [
        f("تصميم واجهات احترافي", "Professional UI design", "تصميم شاشات مخصص بهوية علامتكم وتجربة استخدام سلسة.", "Custom screens in your brand identity with a smooth user experience."),
        f("لوحة تحكم متقدمة", "Advanced admin dashboard", "تقارير، صلاحيات للمشرفين، إدارة الإشعارات والمحتوى بالكامل.", "Reports, admin roles, and full control of notifications and content."),
        f("ربط الأنظمة عند الحاجة", "System integration when needed", "ربط التطبيق بأنظمتكم الحالية أو بوابات الدفع والخرائط والرسائل.", "Connect the app to your existing systems, payment gateways, maps or SMS."),
      ] },
      { tier: "enterprise", price: 128000, features: [
        f("تطبيق مخصص بالكامل", "Fully custom application", "بناء كامل حسب دورة عملكم مع خصائص غير محدودة بقوالب جاهزة.", "Built entirely around your workflow, not limited by ready-made templates."),
        f("خصائص وتجربة مستخدم محسنة", "Enhanced features and UX", "تحليل رحلة المستخدم وتحسين الأداء والسرعة وسهولة الاستخدام.", "User-journey analysis plus better performance, speed and usability."),
        f("تكاملات متعددة", "Multiple integrations", "ربط عدة أنظمة وخدمات خارجية في وقت واحد (دفع، شحن، ERP، CRM).", "Several external systems and services at once (payments, shipping, ERP, CRM)."),
        f("تهيئة للتوسع المستقبلي", "Ready for future growth", "بنية تتحمل زيادة المستخدمين وإضافة خصائص جديدة لاحقاً.", "An architecture that handles more users and new features later."),
      ] },
    ],
  },
  {
    key: "ecommerce",
    name: { ar: "المتاجر الإلكترونية", en: "E-Commerce Stores" },
    tagline: { ar: "متجر متكامل لبيع المنتجات وإدارة الطلبات", en: "A complete store to sell products and manage orders" },
    benefits: [
      { ar: "قناة بيع إضافية لـ {biz} تعمل 24 ساعة يومياً", en: "An extra sales channel for {biz}, open 24 hours a day" },
      { ar: "دفع إلكتروني آمن وتجربة شراء سهلة", en: "Secure online payment and an easy checkout" },
      { ar: "متابعة الطلبات والمبيعات من مكان واحد", en: "Track orders and sales from one place" },
    ],
    scopeNote: { ar: "تُحدد رسوم بوابات الدفع والشحن والخدمات الخارجية حسب مزودي الخدمة.", en: "Payment gateway, shipping and external service fees depend on the providers." },
    packages: [
      { tier: "starter", price: 32000, features: [
        f("متجر حتى 100 منتج", "Store with up to 100 products", "أقسام وصور وأسعار ومواصفات لكل منتج مع بحث وتصفية.", "Categories, images, prices and specs per product, with search and filters."),
        f("بوابات دفع أساسية", "Basic payment gateways", "دفع بالبطاقات أو المحافظ الإلكترونية والدفع عند الاستلام.", "Card or e-wallet payment plus cash on delivery."),
        f("تجربة شراء سهلة", "Easy shopping experience", "سلة مشتريات وإتمام طلب في خطوات قليلة متوافق مع الجوال.", "Cart and checkout in a few steps, optimised for mobile."),
      ] },
      { tier: "business", price: 64000, features: [
        f("متجر حتى 500 منتج", "Store with up to 500 products", "كتالوج أكبر مع خيارات المنتج (مقاسات، ألوان) واستيراد المنتجات.", "A larger catalogue with product options (sizes, colours) and product import."),
        f("إدارة الطلبات والعملاء", "Order and customer management", "حالات الطلب، الفواتير، سجل العملاء وإشعارات الطلب.", "Order statuses, invoices, customer history and order notifications."),
        f("إدارة عروض وقسائم", "Offers and coupons", "خصومات وأكواد قسائم وعروض موسمية تدار من لوحة التحكم.", "Discounts, coupon codes and seasonal offers managed from the dashboard."),
      ] },
      { tier: "enterprise", price: 112000, features: [
        f("متجر متقدم قابل للتوسع", "Advanced scalable store", "أداء عالٍ مع عدد كبير من المنتجات والزوار.", "High performance with large product ranges and traffic."),
        f("خصائص وتكاملات مخصصة", "Custom features and integrations", "ربط شركات الشحن وأنظمة المحاسبة أو ERP وخصائص خاصة بنشاطكم.", "Shipping company, accounting or ERP links and features specific to your business."),
        f("إدارة المنتجات والمخزون", "Product and inventory management", "متابعة الكميات وتنبيهات نفاد المخزون وتحديث تلقائي للتوفر.", "Stock levels, low-stock alerts and automatic availability updates."),
        f("تقارير مبيعات متقدمة", "Advanced sales reports", "تقارير المبيعات والمنتجات الأكثر مبيعاً وسلوك العملاء.", "Sales, best-sellers and customer behaviour reports."),
      ] },
    ],
  },
  {
    key: "erp",
    name: { ar: "أنظمة إدارة الأعمال والعمليات", en: "Management & ERP Systems" },
    tagline: { ar: "حلول متكاملة لإدارة أعمالك الداخلية", en: "Integrated solutions to run your internal operations" },
    benefits: [
      { ar: "تنظيم العمليات الداخلية لـ {biz} في نظام واحد", en: "Organise {biz}'s internal operations in one system" },
      { ar: "تقليل الأخطاء اليدوية وتوفير الوقت", en: "Fewer manual errors and less time wasted" },
      { ar: "تقارير لحظية تدعم اتخاذ القرار", en: "Real-time reports that support decision making" },
    ],
    scopeNote: { ar: "تُحدد الوحدات المطلوبة مثل المخازن والمبيعات والمشتريات والحسابات بعد تحليل الاحتياجات.", en: "Required modules such as inventory, sales, purchasing and accounts are set after a needs analysis." },
    packages: [
      { tier: "starter", price: 40000, features: [
        f("وحدات إدارية أساسية", "Core management modules", "الوحدات الأساسية لنشاطكم (مثل العملاء، المبيعات، أو المخزون) حسب التحليل.", "The core modules for your business (e.g. customers, sales or inventory) per the analysis."),
        f("تقارير أساسية", "Basic reports", "تقارير يومية وشهرية قابلة للطباعة والتصدير.", "Daily and monthly reports you can print and export."),
        f("واجهة سهلة الاستخدام", "Easy-to-use interface", "شاشات واضحة باللغة العربية والإنجليزية لا تحتاج تدريباً طويلاً.", "Clear Arabic and English screens that need little training."),
      ] },
      { tier: "business", price: 80000, features: [
        f("إدارة المستخدمين", "User management", "حسابات للموظفين وسجل بما قام به كل مستخدم.", "Staff accounts and a log of what each user did."),
        f("صلاحيات وتقارير تفصيلية", "Permissions and detailed reports", "تحديد ما يراه ويعدله كل موظف وتقارير تفصيلية لكل قسم.", "Control what each employee can see and change, with detailed reports per department."),
        f("لوحات مؤشرات", "KPI dashboards", "لوحات رسومية تعرض أهم مؤشرات الأداء لحظياً.", "Graphical dashboards showing key performance indicators in real time."),
      ] },
      { tier: "enterprise", price: 160000, features: [
        f("خصائص مخصصة متقدمة", "Advanced custom features", "تطوير خصائص خاصة بدورة عملكم غير المتوفرة في الأنظمة الجاهزة.", "Features built for your workflow that ready-made systems don't offer."),
        f("وحدات متعددة مترابطة", "Multiple connected modules", "مخازن ومبيعات ومشتريات وحسابات وموارد بشرية تعمل معاً ببيانات موحدة.", "Inventory, sales, purchasing, accounts and HR working together on shared data."),
        f("بنية قابلة للتوسع", "Scalable architecture", "تدعم الفروع وزيادة المستخدمين والبيانات.", "Supports more branches, users and data."),
        f("تكاملات متعددة", "Multiple integrations", "ربط مع أنظمة خارجية مثل الفاتورة الإلكترونية والبنوك والمتاجر.", "Links to external systems such as e-invoicing, banks and online stores."),
        f("تقارير وتحليلات متقدمة", "Advanced reports and analytics", "تحليلات مقارنة واتجاهات وتقارير مخصصة للإدارة العليا.", "Comparisons, trends and custom reports for senior management."),
      ] },
    ],
  },
  {
    key: "marketplace",
    name: { ar: "منصات الخدمات الرقمية", en: "Digital Service Marketplace" },
    tagline: { ar: "منصة تربط مقدمي الخدمات بالعملاء", en: "A platform connecting service providers with customers" },
    benefits: [
      { ar: "نموذج أعمال رقمي يربط {biz} بمقدمي الخدمات والعملاء", en: "A digital business model connecting {biz} with providers and customers" },
      { ar: "دخل مستمر من العمولات على كل عملية", en: "Recurring income from commission on every transaction" },
      { ar: "إدارة كاملة للطلبات والمدفوعات والتقييمات", en: "Full control of requests, payments and ratings" },
    ],
    scopeNote: { ar: "تُحدد آلية العمولات والدفع والتحقق من مقدمي الخدمات ضمن نطاق العمل.", en: "Commission, payment and provider verification rules are set in the scope of work." },
    packages: [
      { tier: "starter", price: 64000, features: [
        f("حسابات مستخدمين أساسية", "Basic user accounts", "تسجيل العملاء ومقدمي الخدمات وإدارة الملفات الشخصية.", "Sign-up for customers and providers with profile management."),
        f("طلب خدمة وتواصل", "Service requests and messaging", "طلب الخدمة ومتابعة حالتها والتواصل بين الطرفين.", "Request a service, track its status and message the other party."),
        f("لوحة إدارة أساسية", "Basic admin panel", "إدارة المستخدمين والطلبات والخدمات المعروضة.", "Manage users, requests and listed services."),
      ] },
      { tier: "business", price: 112000, features: [
        f("إدارة ملفات مقدمي الخدمات", "Provider profile management", "ملفات تفصيلية بالخدمات والأسعار والتقييمات ومراجعة الحسابات.", "Detailed profiles with services, prices, ratings and account review."),
        f("نظام عمولات", "Commission system", "احتساب عمولة المنصة تلقائياً على كل عملية وتقارير المستحقات.", "Automatic platform commission per transaction with payout reports."),
        f("إشعارات وتقارير", "Notifications and reports", "إشعارات فورية بالبريد والتطبيق وتقارير أداء المنصة.", "Instant email/app notifications and platform performance reports."),
        f("دفع إلكتروني", "Online payment", "تحصيل المدفوعات إلكترونياً عبر بوابات الدفع المعتمدة.", "Collect payments online through approved payment gateways."),
      ] },
      { tier: "enterprise", price: 192000, features: [
        f("إدارة متعددة لمقدمي الخدمات والعملاء", "Multi-party management", "إدارة أعداد كبيرة من مقدمي الخدمات والعملاء والفئات والمناطق.", "Manage large numbers of providers, customers, categories and regions."),
        f("خصائص مخصصة متقدمة", "Advanced custom features", "خصائص خاصة بنموذج عملكم مثل الاشتراكات أو الحجوزات أو المزادات.", "Features for your model such as subscriptions, bookings or bidding."),
        f("إدارة أدوار وصلاحيات", "Roles and permissions", "أدوار متعددة لفريق الإدارة والدعم والمالية.", "Multiple roles for admin, support and finance teams."),
        f("تكاملات متعددة", "Multiple integrations", "ربط بوابات دفع وخرائط ورسائل وأنظمة خارجية.", "Payment gateways, maps, SMS and external systems."),
        f("قابلية توسع", "Scalability", "بنية تتحمل النمو في عدد المستخدمين والعمليات.", "An architecture that grows with users and transactions."),
      ] },
    ],
  },
  {
    key: "platforms",
    name: { ar: "المنصات الرقمية المتكاملة", en: "Integrated Digital Platforms" },
    tagline: { ar: "منصة موحدة تجمع خدماتك وعملياتك الرقمية", en: "One platform that brings your digital services and operations together" },
    benefits: [
      { ar: "جمع خدمات وعمليات {biz} الرقمية في منصة واحدة", en: "Bring {biz}'s digital services and operations into one platform" },
      { ar: "تجربة موحدة للعملاء والموظفين", en: "One consistent experience for customers and staff" },
      { ar: "بيانات مركزية وتقارير شاملة", en: "Central data and complete reporting" },
    ],
    scopeNote: { ar: "تُحدد المكونات والتكاملات النهائية بعد تحليل نطاق المشروع.", en: "Final components and integrations are set after analysing the project scope." },
    packages: [
      { tier: "starter", price: 40000, features: [
        f("وظائف أساسية مترابطة", "Connected core functions", "الوظائف الأساسية للمنصة مرتبطة ببعضها وتعمل على قاعدة بيانات واحدة.", "The platform's core functions, connected and running on one database."),
        f("تقارير أساسية", "Basic reports", "تقارير دورية عن الاستخدام والعمليات.", "Regular reports on usage and operations."),
        f("واجهة موحدة", "Unified interface", "واجهة واحدة متسقة لكل خدمات المنصة.", "One consistent interface for every service on the platform."),
      ] },
      { tier: "business", price: 80000, features: [
        f("إدارة المستخدمين", "User management", "حسابات وأنواع مستخدمين متعددة وسجل للنشاط.", "Accounts, multiple user types and an activity log."),
        f("صلاحيات وتقارير تفصيلية", "Permissions and detailed reports", "صلاحيات دقيقة لكل دور وتقارير تفصيلية قابلة للتصدير.", "Fine-grained permissions per role and detailed exportable reports."),
        f("لوحة مؤشرات", "KPI dashboard", "مؤشرات أداء رئيسية في لوحة واحدة.", "Key performance indicators on one dashboard."),
      ] },
      { tier: "enterprise", price: 160000, features: [
        f("منصة مخصصة متكاملة", "Fully custom integrated platform", "تصميم وبناء المنصة بالكامل حول احتياجاتكم.", "The whole platform designed and built around your needs."),
        f("وحدات متعددة وتكاملات", "Multiple modules and integrations", "وحدات متعددة تعمل معاً ومرتبطة بأنظمتكم الأخرى.", "Several modules working together and linked to your other systems."),
        f("تحليلات متقدمة", "Advanced analytics", "تحليلات واتجاهات وتقارير مخصصة للإدارة.", "Analytics, trends and custom management reports."),
        f("قابلية توسع مستقبلية ودعم توسع الوظائف", "Future scalability and growth of functions", "بنية تسمح بإضافة وحدات ووظائف جديدة دون إعادة البناء.", "An architecture that lets you add modules and functions without rebuilding."),
      ] },
    ],
  },
  {
    key: "pharmacy",
    name: { ar: "أنظمة إدارة الصيدليات", en: "Pharmacy Management Systems" },
    tagline: { ar: "إدارة المبيعات والمخزون وحركة الأصناف", en: "Manage sales, stock and item movement" },
    benefits: [
      { ar: "ضبط مخزون {biz} ومنع العجز والهالك", en: "Control {biz}'s stock and prevent shortages and waste" },
      { ar: "سرعة البيع ودقة الفواتير", en: "Faster sales and accurate invoices" },
      { ar: "متابعة الصلاحيات والمبيعات بتقارير يومية", en: "Track expiry dates and sales with daily reports" },
    ],
    scopeNote: { ar: "تُحدد متطلبات الفروع والباركود والتكاملات وفق طبيعة الصيدلية.", en: "Branch, barcode and integration requirements are set according to the pharmacy." },
    packages: [
      { tier: "starter", price: 32000, features: [
        f("إدارة الأصناف والمخزون", "Item and stock management", "تسجيل الأصناف والأسعار والكميات وحركة الوارد والمنصرف.", "Items, prices, quantities and stock in/out movements."),
        f("تسجيل المبيعات", "Sales recording", "شاشة بيع سريعة وطباعة فاتورة للعميل.", "A fast point-of-sale screen with customer receipt printing."),
        f("تقارير يومية", "Daily reports", "تقرير مبيعات اليوم وحركة الخزينة والأصناف.", "Daily sales, cash and item movement reports."),
      ] },
      { tier: "business", price: 56000, features: [
        f("متابعة الصلاحية والتشغيل", "Expiry and batch tracking", "تسجيل تواريخ الصلاحية ورقم التشغيلة لكل صنف.", "Expiry dates and batch numbers recorded for every item."),
        f("تقارير مبيعات ومخزون", "Sales and stock reports", "تقارير الأصناف الأكثر مبيعاً والراكدة وقيمة المخزون.", "Best-selling and slow-moving items and stock value reports."),
        f("تنبيهات أساسية", "Basic alerts", "تنبيه قرب انتهاء الصلاحية ونقص الكميات.", "Alerts for items near expiry and low stock."),
        f("صلاحيات للمستخدمين", "User permissions", "صلاحيات مختلفة للصيدلي والكاشير والمدير.", "Different permissions for pharmacist, cashier and manager."),
      ] },
      { tier: "enterprise", price: 96000, features: [
        f("إدارة متقدمة للفروع", "Advanced multi-branch management", "مخزون ومبيعات كل فرع والتحويل بين الفروع وتقارير مجمعة.", "Stock and sales per branch, transfers between branches and combined reports."),
        f("تحليلات وتقارير مخصصة", "Custom analytics and reports", "تقارير مصممة حسب احتياج الإدارة.", "Reports designed around management's needs."),
        f("تكاملات حسب النطاق", "Integrations per scope", "قارئ الباركود، الفاتورة الإلكترونية، أو أنظمة أخرى حسب المتفق عليه.", "Barcode scanners, e-invoicing or other systems, as agreed."),
        f("إدارة الموردين والمشتريات", "Suppliers and purchasing", "أوامر الشراء وحسابات الموردين والمرتجعات.", "Purchase orders, supplier accounts and returns."),
        f("قابلية توسع وتخصيص", "Scalable and customisable", "إضافة فروع وخصائص جديدة مع نمو النشاط.", "Add branches and features as the business grows."),
      ] },
    ],
  },
  {
    key: "real_estate",
    name: { ar: "أنظمة إدارة العقارات", en: "Real Estate Management" },
    tagline: { ar: "إدارة الوحدات والعملاء والعقود والمتابعات", en: "Manage units, customers, contracts and follow-ups" },
    benefits: [
      { ar: "تنظيم وحدات ومشروعات {biz} وبياناتها في مكان واحد", en: "Organise {biz}'s units, projects and data in one place" },
      { ar: "متابعة العملاء المحتملين حتى إتمام البيع", en: "Follow leads all the way to a closed sale" },
      { ar: "التحكم في العقود والأقساط والتحصيل", en: "Control contracts, instalments and collection" },
    ],
    scopeNote: { ar: "يُحدد نطاق إدارة المشروعات والوحدات والعقود وفق دورة العمل.", en: "The scope for projects, units and contracts is set according to your workflow." },
    packages: [
      { tier: "starter", price: 40000, features: [
        f("إدارة بيانات الوحدات", "Unit data management", "تسجيل الوحدات ومساحاتها وأسعارها وحالتها (متاحة / محجوزة / مباعة).", "Units with area, price and status (available / reserved / sold)."),
        f("تسجيل العملاء", "Customer records", "بيانات العملاء واهتماماتهم وسجل التواصل.", "Customer details, interests and contact history."),
        f("متابعة أساسية", "Basic follow-up", "تسجيل المتابعات والمكالمات والمواعيد.", "Log follow-ups, calls and appointments."),
        f("تقارير أولية", "Initial reports", "تقارير الوحدات المتاحة والمبيعات والعملاء.", "Available units, sales and customer reports."),
      ] },
      { tier: "business", price: 72000, features: [
        f("إدارة العقود والحجوزات", "Contracts and reservations", "الحجز والتعاقد وجدول الأقساط وتواريخ الاستحقاق.", "Reservations, contracts, instalment plans and due dates."),
        f("متابعة العملاء والفرص", "Leads and opportunities", "مراحل البيع لكل عميل محتمل وتوزيعهم على فريق المبيعات.", "Sales stages per lead and assignment to the sales team."),
        f("تقارير ولوحات متابعة", "Reports and dashboards", "لوحات المبيعات والتحصيل وأداء الفريق.", "Dashboards for sales, collection and team performance."),
        f("تنبيهات ومهام", "Alerts and tasks", "تنبيه بالأقساط المستحقة والمتابعات والمهام اليومية.", "Alerts for due instalments, follow-ups and daily tasks."),
      ] },
      { tier: "enterprise", price: 128000, features: [
        f("خصائص مخصصة متقدمة", "Advanced custom features", "خصائص خاصة بدورة عملكم مثل إدارة الإيجارات أو الصيانة.", "Features for your workflow such as rentals or maintenance."),
        f("إدارة متعددة للمشروعات", "Multi-project management", "عدة مشروعات ومراحل وأبراج في نظام واحد.", "Several projects, phases and buildings in one system."),
        f("تقارير وتحليلات موسعة", "Extended reports and analytics", "تحليلات المبيعات والتحصيل والمخزون العقاري.", "Sales, collection and property inventory analytics."),
        f("تكاملات وقابلية توسع", "Integrations and scalability", "ربط الموقع الإلكتروني وأنظمة المحاسبة والرسائل والتوسع مستقبلاً.", "Website, accounting and messaging links, ready to grow."),
      ] },
    ],
  },
  {
    key: "ai_automation",
    name: { ar: "حلول الذكاء الاصطناعي والأتمتة", en: "AI & Automation Solutions" },
    tagline: { ar: "أتمتة العمليات لتوفير الوقت وتقليل التكلفة", en: "Automate processes to save time and cut costs" },
    benefits: [
      { ar: "أتمتة المهام المتكررة في {biz} وتوفير وقت الفريق", en: "Automate repetitive work at {biz} and free up your team" },
      { ar: "تقليل التكلفة التشغيلية والأخطاء البشرية", en: "Lower operating costs and fewer human errors" },
      { ar: "قرارات أفضل مبنية على تحليل البيانات", en: "Better decisions based on data analysis" },
    ],
    scopeNote: { ar: "التكلفة النهائية تعتمد على حجم الاستخدام ورسوم الخدمات الخارجية.", en: "The final cost depends on usage volume and external service fees." },
    packages: [
      { tier: "starter", price: 48000, features: [
        f("أتمتة عمليات أساسية", "Basic process automation", "أتمتة عملية أو أكثر من المهام المتكررة (مثل الرسائل أو إدخال البيانات).", "Automate one or more repetitive tasks (such as messages or data entry)."),
        f("لوحة متابعة بسيطة", "Simple monitoring dashboard", "متابعة تنفيذ العمليات المؤتمتة ونتائجها.", "Track automated processes and their results."),
        f("نطاق تسليم واضح", "Clear delivery scope", "تحديد دقيق للعمليات المؤتمتة ومعايير القبول.", "A precise list of automated processes and acceptance criteria."),
      ] },
      { tier: "business", price: 96000, features: [
        f("تحليل بيانات وتقارير", "Data analysis and reports", "تحليل بياناتكم واستخراج مؤشرات وتقارير دورية.", "Analyse your data and produce indicators and regular reports."),
        f("ربط خدمات محددة", "Specific service integrations", "ربط أدوات مثل البريد وواتساب وجداول البيانات وأنظمة CRM.", "Connect tools such as email, WhatsApp, spreadsheets and CRM systems."),
        f("لوحة تحكم متقدمة", "Advanced control panel", "إدارة العمليات والإعدادات ومراجعة النتائج.", "Manage processes and settings and review results."),
      ] },
      { tier: "enterprise", price: 160000, features: [
        f("حلول مخصصة متقدمة", "Advanced custom solutions", "حلول ذكاء اصطناعي مصممة لمشكلات عملكم (مساعد ذكي، تصنيف، استخراج بيانات).", "AI solutions built for your problems (smart assistant, classification, data extraction)."),
        f("حلول أتمتة متعددة", "Multiple automations", "عدة تدفقات أتمتة لأقسام مختلفة.", "Several automation flows across departments."),
        f("تدفقات عمل معقدة", "Complex workflows", "تدفقات متعددة الخطوات مع شروط وموافقات.", "Multi-step flows with conditions and approvals."),
        f("تكاملات مع أنظمة أخرى", "Integrations with other systems", "ربط مع ERP وCRM وقواعد البيانات والخدمات السحابية.", "Links to ERP, CRM, databases and cloud services."),
        f("بنية قابلة للتوسع", "Scalable architecture", "تتحمل زيادة حجم البيانات والاستخدام.", "Handles growing data and usage."),
      ] },
    ],
  },
];

/** A project that fits none of the packages: scope comes from the customer's requirements document. */
export const CUSTOM_SERVICE: Service = {
  key: "custom",
  name: { ar: "مشروع برمجي مخصص", en: "Custom Software Project" },
  tagline: { ar: "حل برمجي مصمم حسب متطلبات العميل", en: "Software built around the client's requirements" },
  benefits: [
    { ar: "حل مصمم خصيصاً لطبيعة عمل {biz} واحتياجاته", en: "A solution designed around how {biz} works" },
    { ar: "تنفيذ كامل نطاق العمل المتفق عليه بجودة عالية", en: "The full agreed scope delivered to a high standard" },
    { ar: "بنية قابلة للتطوير والتوسع مستقبلاً", en: "Built to be extended and scaled later" },
  ],
  scopeNote: { ar: "يُحدد النطاق النهائي وفق مستند المتطلبات المعتمد من العميل.", en: "The final scope follows the requirements document approved by the client." },
  packages: [],
};

export const isCustomService = (key: string) => key === CUSTOM_SERVICE.key;

export const serviceByKey = (key: string) => (isCustomService(key) ? CUSTOM_SERVICE : SERVICES.find((s) => s.key === key) ?? SERVICES[0]!);

/** Standard Fratelanza payment milestones (all services). */
export const MILESTONES: { pct: number; ar: string; en: string }[] = [
  { pct: 30, ar: "المرحلة الأولى: عند التعاقد وبدء المشروع", en: "Phase one: on signing and project start" },
  { pct: 20, ar: "المرحلة الثانية: بعد اعتماد المرحلة الأولى من التنفيذ", en: "Phase two: after approval of the first delivery stage" },
  { pct: 20, ar: "المرحلة الثالثة: بعد اعتماد المرحلة التالية وفق خطة العمل", en: "Phase three: after approval of the next stage in the work plan" },
  { pct: 30, ar: "المرحلة الرابعة: عند التسليم النهائي وفق بنود التعاقد", en: "Phase four: on final delivery under the contract" },
];

/** What every package includes (company commitments). */
export const PROVIDES: Bi[] = [
  { ar: "تسليم السورس كود الكامل للمشروع وفق نطاق التعاقد.", en: "Full project source code handed over within the contract scope." },
  { ar: "دعم فني مجاني لمدة تسعين يومًا من تاريخ التسليم أو الإطلاق المتفق عليه.", en: "Free technical support for 90 days from the agreed delivery or launch date." },
  { ar: "حلول مرنة قابلة للتوسع بما يتناسب مع نمو المشروع.", en: "Flexible, scalable solutions that grow with the project." },
  { ar: "إمكانية تجديد الدعم الفني بعد انتهاء المدة مقابل مادي يتم الاتفاق عليه.", en: "Technical support can be renewed after the period for an agreed fee." },
];

export const PRICE_NOTE: Bi = {
  ar: "الأسعار استرشادية، والسعر النهائي يتحدد حسب الخصائص والمزايا والتكاملات التي يحتاجها العميل ونطاق العمل المتفق عليه.",
  en: "Prices are a guide; the final price depends on the features, integrations and scope of work agreed with the client.",
};

export const EXTERNAL_FEES_NOTE: Bi = {
  ar: "رسوم بوابات الدفع والشحن والاستضافة والخدمات الخارجية قد تُحسب منفصلة.",
  en: "Payment gateway, shipping, hosting and other external service fees may be charged separately.",
};

/** Delivery stages used in the technical proposal (aligned with the payment milestones). */
export const STAGES: { ar: string; en: string; dAr: string; dEn: string }[] = [
  { ar: "التحليل والتخطيط", en: "Analysis & planning", dAr: "جمع المتطلبات وتأكيد نطاق العمل وخطة التنفيذ.", dEn: "Gather requirements, confirm the scope and the delivery plan." },
  { ar: "التصميم والتطوير", en: "Design & development", dAr: "تصميم الواجهات وتطوير الخصائص المتفق عليها على مراحل.", dEn: "Design the interfaces and build the agreed features in stages." },
  { ar: "الاختبار والمراجعة", en: "Testing & review", dAr: "اختبار شامل ومراجعة العميل وتنفيذ الملاحظات ضمن النطاق.", dEn: "Full testing, client review and fixes within the scope." },
  { ar: "التسليم والإطلاق", en: "Delivery & launch", dAr: "الإطلاق وتسليم السورس كود وبدء فترة الدعم المجاني.", dEn: "Go live, hand over the source code and start the free support period." },
];
