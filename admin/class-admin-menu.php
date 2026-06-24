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

	const MENU_POSITION = 21;

	const SUBMENU_LANDINGS = 'edit.php?post_type=' . Art_Editor_Landing_Post_Type::POST_TYPE;

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_menu' ), 5 );
		add_action( 'admin_menu', array( __CLASS__, 'finalize_menu' ), 999 );
		add_filter( 'parent_file', array( __CLASS__, 'filter_parent_file' ) );
		add_filter( 'submenu_file', array( __CLASS__, 'filter_submenu_file' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
		add_filter( 'plugin_action_links_' . ART_EDITOR_PLUGIN_BASENAME, array( __CLASS__, 'plugin_action_links' ) );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'plugin_row_meta_forge' ), 10, 2 );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'plugin_row_meta_strip_details' ), 100, 2 );
	}

	/**
	 * Register admin menu items.
	 */
	public static function register_menu() {
		add_menu_page(
			__( 'ART Editor', 'art-editor' ),
			__( 'ART Editor', 'art-editor' ),
			'edit_posts',
			self::MENU_SLUG,
			array( __CLASS__, 'render_menu_home' ),
			'dashicons-layout',
			self::MENU_POSITION
		);

		add_submenu_page(
			self::MENU_SLUG,
			__( 'Лендинги', 'art-editor' ),
			__( 'Лендинги', 'art-editor' ),
			'edit_posts',
			self::SUBMENU_LANDINGS
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
		if ( current_user_can( 'edit_posts' ) ) {
			wp_safe_redirect( admin_url( self::SUBMENU_LANDINGS ) );
			exit;
		}

		Art_Editor_Admin_Settings::render_settings_page();
	}

	/**
	 * Keep ART Editor menu open on plugin admin screens.
	 *
	 * @param string $parent_file Parent file.
	 * @return string
	 */
	public static function filter_parent_file( $parent_file ) {
		if ( self::is_plugin_admin_screen() ) {
			return self::MENU_SLUG;
		}

		return $parent_file;
	}

	/**
	 * Highlight the matching submenu entry on plugin admin screens.
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

	/**
	 * Remove PUC «View details» link from plugin row meta.
	 *
	 * @param array<int, string> $links Plugin row meta links.
	 * @param string             $file  Plugin basename.
	 * @return array<int, string>
	 */
	public static function plugin_row_meta_strip_details( $links, $file ) {
		if ( ART_EDITOR_PLUGIN_BASENAME !== $file ) {
			return $links;
		}

		return array_values(
			array_filter(
				$links,
				static function ( $link ) {
					return false === strpos( $link, 'open-plugin-details-modal' )
						&& false === strpos( $link, 'plugin-install.php?tab=plugin-information' );
				}
			)
		);
	}
}
