=== ART Editor ===
Contributors: artbashlykov
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 0.2.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Full-screen Gutenberg HTML block workspace for pages, posts, and custom post types.

== Description ==

ART Editor extends the standard `core/html` block with a toolbar entry labeled "HTML Editor". The plugin is designed for pages, posts, and custom post types that use the block editor.

Planned features include a full-screen HTML editing workspace and a canvas layout mode that renders singular content without the theme header and footer.

== Installation ==

1. Upload the `art-editor` folder to `/wp-content/plugins/`.
2. Activate ART Editor through the WordPress Plugins screen.
3. Edit a page, post, or supported custom post type in Gutenberg.

== Changelog ==

= 0.2.2 =
* Admin menu moved to a standalone section directly below Pages.

= 0.2.1 =
* Auto-switch to the Code tab when creating a new HTML block.
* Keep the selected block after save instead of jumping to the first block.
* Lock the editor UI while save is in progress.

= 0.2.0 =
* Custom post type «Лендинги» with `/lp/{slug}` URLs.
* Admin menu moved under «Страницы»: landings list and plugin settings.
* Landings enabled in ART Editor settings by default.
* Fixed flickering «Редактор HTML» button in Gutenberg on new posts.
* Tested up to WordPress 7.0.

= 0.1.0 =
Initial plugin scaffold.
