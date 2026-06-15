<?php
/**
 * Admin settings page.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Admin_Settings
 */
class Art_Editor_Admin_Settings {

	const PAGE_SETTINGS = 'art-editor-settings';

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
	}

	/**
	 * Register plugin settings.
	 */
	public static function register_settings() {
		register_setting(
			'art_editor_settings_group',
			Art_Editor_Settings::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( 'Art_Editor_Settings', 'sanitize_settings' ),
				'default'           => Art_Editor_Settings::get_default_settings(),
			)
		);
	}

	/**
	 * Build settings page URL.
	 *
	 * @return string
	 */
	public static function get_settings_url() {
		return admin_url( 'admin.php?page=' . self::PAGE_SETTINGS );
	}

	/**
	 * Render settings page.
	 */
	public static function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'У вас нет прав просматривать эту страницу.', 'art-editor' ) );
		}

		include ART_EDITOR_PLUGIN_DIR . 'admin/views/page-settings.php';
	}
}
