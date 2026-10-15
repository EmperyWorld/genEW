# genEW

Основа платформы Empery World для сборки, развития и запуска сервисов
из рецептов, шаблонов и общих контрактов.

**Лицензия:** [MIT](LICENSE) для собственного кода проекта. Сторонние компоненты,
импортированные материалы и модели сохраняют свои лицензии; см. [NOTICE](NOTICE).

## Состав

- Empery Control Center — управление сервисами, сборкой и эксплуатацией.
- Empery Desktop — оболочка для запуска приложений в окнах.
- Intelligence Core и Assembler — оркестрация и сборка сервисов.
- Core — контракты, реестр сервисов, DI и события.
- Продуктовые каталоги рецептов, схем и шаблонов — в
  `.cursor/orchestration/recipes/`, `.cursor/orchestration/assembly/` и
  `.cursor/orchestration/nervas/`.

Проект находится в развитии. Публикация исходников не означает готовность
всей платформы или подтверждение работоспособности каждого сервиса.

## Начало работы

```bash
cp .env.example .env
# Настройте собственные адреса сервисов, секреты и локальную модель.
mkdir -p .data/eic/models
podman-compose -f compose.yml up -d --build
```

Подробные инструкции:

- [Control Center](EMPERY_CONTROL_CENTER.md)
- [Podman](PODMAN.md)
- [llama.cpp и окружение платформы](README_llama_cpp.md)
- [Empery Desktop](apps/empery_desktop/README.md)
- [Интерфейс Control Center](apps/empery_control_center/README.md)

`reference/` — справочный корпус, который не импортируется в runtime.
Существующие уведомления и условия исходных компонентов сохраняются.

## Публичные исходники

[EmperyWorld/genEW](https://github.com/EmperyWorld/genEW) содержит текущее
состояние одним начальным коммитом без старой истории. Личные настройки
агентов, рабочие задания и отчёты, секреты, модели, кэши и GitHub Actions
не входят в публичный снимок. Продуктовые каталоги рецептов, схем и шаблонов
сохранены по исходным путям.
