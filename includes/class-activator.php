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
		Art_Editor_Settings::maybe_seed_defaults();
		flush_rewrite_rules();
	}
}
