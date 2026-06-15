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

	const PARENT_MENU_SLUG = 'edit.php?post_type=page';

	const SUBMENU_LANDINGS = 'edit.php?post_type=' . Art_Editor_Landing_Post_Type::POST_TYPE;

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_menu' ), 5 );
		add_filter( 'parent_file', array( __CLASS__, 'filter_parent_file' ) );
		add_filter( 'submenu_file', array( __CLASS__, 'filter_submenu_file' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
		add_filter( 'plugin_action_links_' . ART_EDITOR_PLUGIN_BASENAME, array( __CLASS__, 'plugin_action_links' ) );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'plugin_row_meta_forge' ), 10, 2 );
	}

	/**
	 * Register admin menu items.
	 */
	public static function register_menu() {
		add_submenu_page(
			self::PARENT_MENU_SLUG,
			__( 'Лендинги', 'art-editor' ),
			__( 'Лендинги', 'art-editor' ),
			'edit_posts',
			self::SUBMENU_LANDINGS
		);

		add_submenu_page(
			self::PARENT_MENU_SLUG,
			__( 'ART Editor', 'art-editor' ),
			__( 'ART Editor', 'art-editor' ),
			'manage_options',
			Art_Editor_Admin_Settings::PAGE_SETTINGS,
			array( 'Art_Editor_Admin_Settings', 'render_settings_page' )
		);
	}

	/**
	 * Keep the Pages menu open on ART Editor screens.
	 *
	 * @param string $parent_file Parent file.
	 * @return string
	 */
	public static function filter_parent_file( $parent_file ) {
		if ( self::is_plugin_admin_screen() ) {
			return self::PARENT_MENU_SLUG;
		}

		return $parent_file;
	}

	/**
	 * Highlight the matching submenu entry on ART Editor screens.
	 *
	 * @param string $submenu_file Submenu file.
	 * @return string
	 */
	public static function filter_submenu_file( $submenu_file ) {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Admin menu highlight only.
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';

		if ( Art_Editor_Admin_Settings::PAGE_SETTINGS === $page ) {
			return Art_Editor_Admin_Settings::PAGE_SETTINGS;
		}

		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;

		if ( $screen && Art_Editor_Landing_Post_Type::POST_TYPE === $screen->post_type ) {
			return self::SUBMENU_LANDINGS;
		}

		return $submenu_file;
	}

	/**
	 * Whether the current admin screen belongs to ART Editor.
	 *
	 * @return bool
	 */
	private static function is_plugin_admin_screen() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Admin menu highlight only.
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';

		if ( Art_Editor_Admin_Settings::PAGE_SETTINGS === $page ) {
			return true;
		}

		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;

		return $screen && Art_Editor_Landing_Post_Type::POST_TYPE === $screen->post_type;
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
