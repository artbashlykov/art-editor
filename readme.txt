=== ART Editor ===
Contributors: artbashlykov
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 0.2.25
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

= 0.2.25 =
* Structure sidebar: on the View tab, clicking an HTML block switches to Edit for that block.
* Anchor blocks: creating or selecting an anchor while on View now opens the anchor settings panel.

= 0.2.24 =
* Preview loading overlay: semi-transparent backdrop with spinner while Edit/View iframe previews reload.
* Blocks scrolling during reload when switching to Edit/View tabs or desktop/mobile preview modes.

= 0.2.23 =
* Fix white gaps between HTML blocks on frontend and in preview: stop reserving min-height on block wrappers.
* Strip viewport height (100vh and similar) from scoped html/body/:root reset rules so each block wrapper is not forced to full-screen height.

= 0.2.22 =
* Element editor: external margin (top/bottom) for all elements except images; margin controls moved below the link section.
* Div and section keep internal padding controls in the style panel.

= 0.2.21 =
* Preview stability: remove client-side unscoped preview fallback when REST fails; keep the last good server preview and show a warning banner with retry.
* Preview errors are shown separately for Edit and View tabs.

= 0.2.20 =
* Element editor: select parent containers (section, div) via repeated click at the same spot, Alt+click, or the new Parent button in the sidebar.
* Fixes cases where only inner content was selectable because children covered the full section area.

= 0.2.19 =
* Fix CSS scoping: skip block comments so @media rules and selectors after /* comments */ stay valid (AI-generated HTML).
* Improve scoping parser: ignore braces inside CSS strings and comments.
* Mobile preview: set iframe viewport width to the device frame width so media queries match the preview.

= 0.2.18 =
* Fix element editor after server-side preview scoping (0.2.14+): normalize DOM paths between scoped iframe and block HTML so styles, padding, margin, links, images, delete, and text edits apply again.
* Restore element selection after preview reload using the actual scoped wrapper path in the iframe.
* Clear stale selection restore when edit preview REST falls back to client-side HTML.

= 0.2.17 =
* Fix fatal REST error: register leave-builder route with correct namespace and path (preview-document and preview-edit-block no longer return 500).

= 0.2.16 =
* Fix multi-block preview overlap: scoped wrappers now reserve min-height when block CSS uses viewport-positioned fixed/absolute layouts.
* Rewrite inline position:fixed in block HTML during scoping.
* Canvas layout: flow-root stacking for .art-editor-html-block wrappers.

= 0.2.15 =
* Element editor for div/section: grouped internal padding and external margin controls (top/bottom).
* Margin supports negative values (-200 to 500 px); inline styles override CSS classes.
* Panel layout: section dividers and group titles before link settings.

= 0.2.14 =
* HTML block isolation: unified CSS scoping for Edit, View, and frontend (body/html/:root remapped to block wrapper).
* AI HTML normalization: strip document shell (DOCTYPE/html/body), collect styles and stylesheet links.
* Scoped blocks use isolation and rewrite position:fixed to position:absolute inside blocks.
* Edit tab preview now uses server-side scoping (same pipeline as View tab).

= 0.2.13 =
* Fix: «Delete data on uninstall» checkbox now saves on the first submit (WordPress double-sanitize).
* Edit tab: Escape clears the selected element and closes the element editor panel (same as the sidebar close button).

= 0.2.12 =
* Settings: optional «Delete all plugin data on uninstall» checkbox (section «Данные при удалении»).
* uninstall.php and class-uninstaller.php remove options, post meta, art_landing posts, PUC cron/transients when enabled.
* Pages, posts, and user content are preserved; only plugin-owned data is removed.

= 0.2.11 =
* Gutenberg round-trip: non-HTML blocks import into the first HTML block on ART Editor open and restore as Gutenberg blocks on return.
* Builder panel: «Вернуться в Gutenberg» button (same flow as the toolbar action).
* Fix: Gutenberg block validation errors after return (lists, paragraphs with inner blocks).
* Embedded Gutenberg blocks are stored as canonical block markup instead of JSON arrays.

= 0.2.10 =
* Fix: returning from ART Editor to Gutenberg no longer corrupts block HTML (`u003C` instead of `<`).
* Gutenberg blocks meta uses base64 storage; legacy corrupted meta is repaired on read/import.

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
