<?php
/**
 * Canvas page template for ART Editor posts.
 *
 * Standalone shell (no theme header/footer). Optional ART Editor site chrome
 * is injected only when layout mode is `canvas_chrome`. Plain `canvas` stays
 * chrome-free for backward compatibility.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

$art_editor_canvas_post_id = (int) get_queried_object_id();
$art_editor_canvas_layout  = Art_Editor_Post_Meta::get_layout_mode( $art_editor_canvas_post_id );

ob_start();

while ( have_posts() ) {
	the_post();
	the_content();
}

$art_editor_canvas_inner = ob_get_clean();
$art_editor_canvas_shell = Art_Editor_Frontend::wrap_canvas_shell( $art_editor_canvas_inner, $art_editor_canvas_layout );

?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class( 'art-editor-template-canvas' ); ?>>
<?php wp_body_open(); ?>
<?php
// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Shell wraps the_content + trusted site chrome HTML.
echo $art_editor_canvas_shell;
?>
<?php wp_footer(); ?>
</body>
</html>
