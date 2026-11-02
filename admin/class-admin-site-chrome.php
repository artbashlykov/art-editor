<?php
/**
 * Admin hub for site header/footer.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Admin_Site_Chrome
 */
class Art_Editor_Admin_Site_Chrome {

	const PAGE_SLUG = 'art-editor-site-chrome';

	const NONCE_ACTION = 'art_editor_save_site_chrome';

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'handle_save' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
	}

	/**
	 * Hub script: autosave toggles without a Save button.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public static function enqueue_assets( $hook ) {
		if ( 'art-editor_page_' . self::PAGE_SLUG !== $hook ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$script_path = ART_EDITOR_PLUGIN_DIR . 'assets/js/site-chrome-hub.js';

		wp_enqueue_script(
			'art-editor-site-chrome-hub',
			ART_EDITOR_PLUGIN_URL . 'assets/js/site-chrome-hub.js',
			array(),
			file_exists( $script_path ) ? (string) filemtime( $script_path ) : ART_EDITOR_VERSION,
			true
		);
	}

	/**
	 * Hub URL.
	 *
	 * @return string
	 */
	public static function get_page_url() {
		return admin_url( 'admin.php?page=' . self::PAGE_SLUG );
	}

	/**
	 * Persist toggles from the hub form.
	 */
	public static function handle_save() {
		if ( ! isset( $_POST['art_editor_site_chrome_save'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Checked below.
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'У вас нет прав изменять эти настройки.', 'art-editor' ) );
		}

		check_admin_referer( self::NONCE_ACTION );

		Art_Editor_Site_Chrome::ensure_service_post();

		Art_Editor_Site_Chrome::update_settings(
			array(
				'header_enabled' => ! empty( $_POST['art_editor_header_enabled'] ),
				'footer_enabled' => ! empty( $_POST['art_editor_footer_enabled'] ),
			)
		);

		wp_safe_redirect(
			add_query_arg(
				array(
					'page'    => self::PAGE_SLUG,
					'updated' => '1',
				),
				admin_url( 'admin.php' )
			)
		);
		exit;
	}

	/**
	 * Render B1 hub screen.
	 */
	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'У вас нет прав просматривать эту страницу.', 'art-editor' ) );
		}

		Art_Editor_Site_Chrome::ensure_service_post();

		$settings    = Art_Editor_Site_Chrome::get_settings();
		$header_url  = Art_Editor_Site_Chrome::get_editor_url( Art_Editor_Site_Chrome::ZONE_HEADER );
		$footer_url  = Art_Editor_Site_Chrome::get_editor_url( Art_Editor_Site_Chrome::ZONE_FOOTER );
		$show_notice = isset( $_GET['updated'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only admin notice flag.

		include ART_EDITOR_PLUGIN_DIR . 'admin/views/page-site-chrome.php';
	}
}
