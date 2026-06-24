=== ART Editor ===
Contributors: artbashlykov
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 0.2.9
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

= 0.2.9 =
* GitHub updates via Plugin Update Checker (PUC per art-agent-standards/PUC.md): User-Agent, art-editor.zip release assets, three-layer hide «Details».
* Release build script: scripts/build-release.php.

= 0.2.8 =
* Removed bundled Plugin Update Checker to comply with WordPress.org Plugin Check (custom updaters are not allowed on the directory).
* Install and update ART Editor via ART Master Install or GitHub releases.

= 0.2.7 =
* GitHub updates via Plugin Update Checker: «Проверить обновления» on the Plugins screen and WordPress auto-update toggle.

= 0.2.6 =
* Editor: padding-top and padding-bottom controls for div and section elements only.
* Editor: style apply logic filters properties by element type (text, background, block spacing).

= 0.2.5 =
* Canvas: fix white gap above content when logged in (admin bar margin).
* Canvas and preview: smooth scroll to anchors; link underline only without explicit text-decoration.
* Editor: italic, underline, and strikethrough toggles for text elements (hidden for div/section).
* Editor: line-height control with unitless, px, and percent values.
* Editor: compact style panel layout; uniform width for selects and color inputs.
* Editor: fix underline/strikethrough inline styles and link decoration suppression.

= 0.2.4 =
* Anchor blocks: «Добавить якорь» button, dedicated anchor panel, disabled Code/Edit tabs for anchors.
* Editor: gray Save button when there are no unsaved changes (including hover); orange when dirty.
* Editor: font weight control (100–900); text styles hidden for block-level elements like div/section.
* Editor: fix link options collapse animation; fix styles reset when adding a link.
* Editor: active element highlight uses outline only (no gray fill).
* Editor: flush pending element edits only on save (fixes font size/color regression).

= 0.2.3 =
* Frontend admin bar button «Редактор HTML» on published ART Editor pages.
* REST: post status sanitized on html-blocks save (publish capability check).
* Gutenberg: redirect to ART Editor only after successful savePost().
* Editor: flush pending link edits before save; normalize link URLs on input.
* Editor: auto-save slug on blur (like title).
* Editor: correct sidebar switching between element panel and page settings.
* Canvas: admin bar offset on frontend.

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
