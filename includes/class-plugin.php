<?php
/**
 * Main plugin bootstrap.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Plugin
 */
class Art_Editor_Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Art_Editor_Plugin|null
	 */
	private static $instance = null;

	/**
	 * @return Art_Editor_Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->load_dependencies();
	}

	/**
	 * Load required class files.
	 */
	private function load_dependencies() {
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-landing-post-type.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-post-meta.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-content.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-preview.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-settings.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-rest.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-block-editor.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-editor-screen.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-frontend.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-admin-bar.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-updater.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'admin/class-admin-menu.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'admin/class-admin-settings.php';
		require_once ART_EDITOR_PLUGIN_DIR . 'admin/class-admin-list-table.php';
	}

	/**
	 * Register hooks and initialize modules.
	 */
	public function run() {
		if ( is_admin() ) {
			Art_Editor_Updater::init();
		}

		Art_Editor_Landing_Post_Type::init();
		Art_Editor_Post_Meta::init();
		Art_Editor_Settings::init();
		Art_Editor_Rest::init();
		Art_Editor_Admin_Menu::init();
		Art_Editor_Admin_Settings::init();
		Art_Editor_Admin_List_Table::init();
		Art_Editor_Block_Editor::init();
		Art_Editor_Editor_Screen::init();
		Art_Editor_Frontend::init();
		Art_Editor_Admin_Bar::init();
	}
}
