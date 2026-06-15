<?php
/**
 * Admin integration.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Admin_Menu
 */
class Art_Editor_Admin_Menu {

	const MENU_SLUG = ART_EDITOR_ADMIN_MENU_SLUG;

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_menu' ), 5 );
		add_action( 'admin_menu', array( __CLASS__, 'finalize_menu' ), 999 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
		add_filter( 'plugin_action_links_' . ART_EDITOR_PLUGIN_BASENAME, array( __CLASS__, 'plugin_action_links' ) );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'plugin_row_meta_forge' ), 10, 2 );
	}

	/**
	 * Register admin menu items.
	 */
	public static function register_menu() {
		add_menu_page(
			__( 'ART Editor', 'art-editor' ),
			__( 'ART Editor', 'art-editor' ),
			'manage_options',
			self::MENU_SLUG,
			array( __CLASS__, 'render_menu_home' ),
			'dashicons-layout',
			81
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( 'Настройки', 'art-editor' ),
			__( 'Настройки', 'art-editor' ),
			'manage_options',
			Art_Editor_Admin_Settings::PAGE_SETTINGS,
			array( 'Art_Editor_Admin_Settings', 'render_settings_page' )
		);
	}

	/**
	 * Remove duplicate top-level submenu entry.
	 */
	public static function finalize_menu() {
		remove_submenu_page( self::MENU_SLUG, self::MENU_SLUG );
	}

	/**
	 * Default landing page for ART Editor menu.
	 */
	public static function render_menu_home() {
		Art_Editor_Admin_Settings::render_settings_page();
	}

	/**
	 * Enqueue admin assets.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public static function enqueue_assets( $hook ) {
		if ( false === strpos( $hook, 'art-editor' ) ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		wp_enqueue_style(
			'art-editor-brand',
			ART_EDITOR_PLUGIN_URL . 'assets/css/brand.css',
			array(),
			ART_EDITOR_VERSION
		);

		wp_enqueue_style(
			'art-editor-admin',
			ART_EDITOR_PLUGIN_URL . 'assets/css/admin.css',
			array( 'art-editor-brand' ),
			ART_EDITOR_VERSION
		);
	}

	/**
	 * Add settings link on the plugins list page.
	 *
	 * @param array $links Plugin action links.
	 * @return array
	 */
	public static function plugin_action_links( $links ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return $links;
		}

		$settings_link = sprintf(
			'<a href="%s">%s</a>',
			esc_url( Art_Editor_Admin_Settings::get_settings_url() ),
			esc_html__( 'Настройки', 'art-editor' )
		);

		return array_merge( array( $settings_link ), $links );
	}

	/**
	 * Add author materials link on plugins page.
	 *
	 * @param array  $links Plugin row links.
	 * @param string $file  Plugin basename.
	 * @return array
	 */
	public static function plugin_row_meta_forge( $links, $file ) {
		if ( ART_EDITOR_PLUGIN_BASENAME !== $file ) {
			return $links;
		}

		$links[] = sprintf(
			'<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
			esc_url( ART_EDITOR_AUTHOR_URL ),
			esc_html__( 'Больше материалов автора', 'art-editor' )
		);

		return $links;
	}
}
