<?php
/**
 * Canvas page template for ART Editor posts.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class( 'art-editor-template-canvas' ); ?>>
<?php wp_body_open(); ?>
<div class="art-editor-canvas">
	<div class="art-editor-canvas__content">
		<?php
		while ( have_posts() ) {
			the_post();
			the_content();
		}
		?>
	</div>
</div>
<?php wp_footer(); ?>
</body>
</html>
