<?php
/**
 * Plugin deactivation.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Deactivator
 */
class Art_Editor_Deactivator {

	/**
	 * Run on plugin deactivation.
	 */
	public static function deactivate() {
		flush_rewrite_rules();
	}
}
