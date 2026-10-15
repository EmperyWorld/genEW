-- EWRP — добавить в каталог магазина приложений (если ещё нет).
INSERT INTO desktop_app_catalog (
    app_id,
    name,
    description,
    app_component,
    category,
    gradient,
    color,
    sort_order,
    is_system
) VALUES (
    'app-ewrp',
    'EWRP',
    'Соберите презентацию на базе лендинга: допишите текст, подберите иллюстрации, получите слайды в PDF. Удобно показать экран на встрече или отправить файл тем, кто подключился позже.',
    'EWRP',
    'productivity',
    'from-cyan-500 to-teal-600',
    'text-cyan-400',
    120,
    false
) ON CONFLICT (app_id) DO NOTHING;
