# ART Editor

Официальный репозиторий: https://github.com/artbashlykov/art-editor

ART Editor — простой редактор HTML-блоков Gutenberg для создания красивых лендингов с помощью нейросетей. Кнопка «Редактор HTML» в тулбаре записи открывает отдельное рабочее пространство для работы со стандартными блоками `core/html`.

## Установка

1. Скопируйте папку `art-editor` в `wp-content/plugins/`.
2. Активируйте плагин «ART Editor» в панели WordPress.
3. Откройте страницу, запись, лендинг или другой поддерживаемый тип записи в Gutenberg.

## Лендинги

Плагин регистрирует тип записи «Лендинги» с адресами вида `/lp/название-лендинга`. Управление — в меню **ART Editor → Лендинги**.

## Шапка и подвал сайта

Меню **ART Editor → Шапка и подвал**: общая HTML-шапка и подвал для темы. Тумблеры «Показывать на сайте» по умолчанию выключены.

Публичный API для темы:

```php
$header = function_exists( 'art_editor_get_site_header' ) ? art_editor_get_site_header() : null;
if ( $header ) {
	echo $header['html']; // сырой HTML админа
}

$footer = function_exists( 'art_editor_get_site_footer' ) ? art_editor_get_site_footer() : null;
```

Возвращают `null`, если зона выключена или HTML пустой. Canvas-шаблон Editor chrome не вставляет — это делает тема на обычных шаблонах.

## Планируемые возможности

- Редактор HTML-блоков в тулбаре записи (как у Elementor).
- Поддержка типов записей: `page`, `post` и кастомные CPT с редактором блоков.
- Canvas-режим: вывод страницы без header/footer темы.

## Материалы автора

Больше материалов автора: https://forge.artbashlykov.ru

## Лицензия

GPL v2 or later.
