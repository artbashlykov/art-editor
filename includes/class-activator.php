<?php
/**
 * Plugin activation.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Activator
 */
class Art_Editor_Activator {

	/**
	 * Run on plugin activation.
	 */
	public static function activate() {
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-landing-post-type.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-settings.php';

		Art_Editor_Landing_Post_Type::register_post_type();
		Art_Editor_Settings::maybe_seed_defaults();
		flush_rewrite_rules();
	}
}
