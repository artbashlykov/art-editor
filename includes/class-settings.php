<?php
/**
 * Plugin settings storage.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Settings
 */
class Art_Editor_Settings {

	const OPTION = 'art_editor_settings';

	const OPTION_DELETE_DATA_ON_UNINSTALL = 'art_editor_delete_data_on_uninstall';

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'maybe_seed_defaults' ) );
		add_action( 'admin_init', array( __CLASS__, 'maybe_migrate_post_types' ) );
	}

	/**
	 * Ensure default settings exist.
	 */
	public static function maybe_seed_defaults() {
		if ( false !== get_option( self::OPTION, false ) ) {
			return;
		}

		update_option( self::OPTION, self::get_default_settings(), false );
	}

	/**
	 * Default plugin settings.
	 *
	 * @return array
	 */
	public static function get_default_settings() {
		return array(
			'post_types' => array( 'art_landing', 'post', 'page' ),
		);
	}

	/**
	 * Ensure landing post type is enabled for existing installations.
	 */
	public static function maybe_migrate_post_types() {
		$settings = get_option( self::OPTION, false );

		if ( false === $settings || ! is_array( $settings ) ) {
			return;
		}

		$post_types = isset( $settings['post_types'] ) && is_array( $settings['post_types'] )
			? $settings['post_types']
			: array();

		if ( in_array( Art_Editor_Landing_Post_Type::POST_TYPE, $post_types, true ) ) {
			return;
		}

		$post_types[]               = Art_Editor_Landing_Post_Type::POST_TYPE;
		$settings['post_types']     = array_values( array_unique( array_map( 'sanitize_key', $post_types ) ) );
		$settings['post_types']     = self::sanitize_settings( $settings )['post_types'];

		update_option( self::OPTION, $settings, false );
	}

	/**
	 * Get saved settings merged with defaults.
	 *
	 * @return array
	 */
	public static function get_settings() {
		$settings = get_option( self::OPTION, array() );

		if ( ! is_array( $settings ) ) {
			$settings = array();
		}

		return wp_parse_args( $settings, self::get_default_settings() );
	}

	/**
	 * Get enabled post type slugs.
	 *
	 * @return string[]
	 */
	public static function get_enabled_post_types() {
		$settings   = self::get_settings();
		$post_types = isset( $settings['post_types'] ) && is_array( $settings['post_types'] )
			? $settings['post_types']
			: self::get_default_settings()['post_types'];

		return array_values(
			array_unique(
				array_filter(
					array_map( 'sanitize_key', $post_types )
				)
			)
		);
	}

	/**
	 * Whether ART Editor is enabled for a post type.
	 *
	 * @param string $post_type Post type slug.
	 * @return bool
	 */
	public static function is_post_type_enabled( $post_type ) {
		$post_type = sanitize_key( $post_type );

		if ( '' === $post_type ) {
			return false;
		}

		return in_array( $post_type, self::get_enabled_post_types(), true );
	}

	/**
	 * Whether plugin data should be removed on uninstall.
	 *
	 * @return bool
	 */
	public static function delete_data_on_uninstall_enabled() {
		return 'yes' === get_option( self::OPTION_DELETE_DATA_ON_UNINSTALL, 'no' );
	}

	/**
	 * Persist the uninstall data removal preference.
	 *
	 * @param bool $enabled Whether to delete data on uninstall.
	 */
	public static function set_delete_data_on_uninstall( $enabled ) {
		update_option( self::OPTION_DELETE_DATA_ON_UNINSTALL, $enabled ? 'yes' : 'no', false );
	}

	/**
	 * Post types available in the settings UI.
	 *
	 * @return WP_Post_Type[]
	 */
	public static function get_selectable_post_types() {
		$post_types = get_post_types(
			array(
				'show_ui' => true,
			),
			'objects'
		);

		unset( $post_types['attachment'] );

		$post_types = array_filter(
			$post_types,
			function( $post_type_object ) {
				return $post_type_object instanceof WP_Post_Type
					&& use_block_editor_for_post_type( $post_type_object->name );
			}
		);

		uasort(
			$post_types,
			function( $left, $right ) {
				$left_name  = $left instanceof WP_Post_Type ? $left->name : '';
				$right_name = $right instanceof WP_Post_Type ? $right->name : '';

				if ( 'page' === $left_name ) {
					return -1;
				}

				if ( 'page' === $right_name ) {
					return 1;
				}

				if ( Art_Editor_Landing_Post_Type::POST_TYPE === $left_name ) {
					return -1;
				}

				if ( Art_Editor_Landing_Post_Type::POST_TYPE === $right_name ) {
					return 1;
				}

				$left_label  = $left instanceof WP_Post_Type ? $left->labels->name : '';
				$right_label = $right instanceof WP_Post_Type ? $right->labels->name : '';

				return strcasecmp( (string) $left_label, (string) $right_label );
			}
		);

		return $post_types;
	}

	/**
	 * Sanitize settings payload.
	 *
	 * @param mixed $value Raw settings.
	 * @return array
	 */
	public static function sanitize_settings( $value ) {
		$defaults  = self::get_default_settings();
		$sanitized = $defaults;

		if ( is_array( $value ) ) {
			if ( array_key_exists( 'delete_data_on_uninstall', $value ) ) {
				self::set_delete_data_on_uninstall( 'yes' === self::parse_yes_no_setting( $value['delete_data_on_uninstall'] ) );
			}

			$allowed_slugs = array_keys( self::get_selectable_post_types() );
			$raw_post_types = isset( $value['post_types'] ) && is_array( $value['post_types'] )
				? $value['post_types']
				: array();

			$sanitized['post_types'] = array();

			foreach ( $raw_post_types as $post_type ) {
				$post_type = sanitize_key( $post_type );

				if ( '' === $post_type || ! in_array( $post_type, $allowed_slugs, true ) ) {
					continue;
				}

				$sanitized['post_types'][] = $post_type;
			}

			$sanitized['post_types'] = array_values( array_unique( $sanitized['post_types'] ) );
		}

		return $sanitized;
	}

	/**
	 * Normalize yes/no flag from a checkbox (0/1) or stored yes/no string.
	 *
	 * WordPress may run sanitize callbacks twice; stored "no" must not pass !empty().
	 *
	 * @param mixed $value Raw value.
	 * @return string "yes" or "no".
	 */
	public static function parse_yes_no_setting( $value ) {
		if ( is_string( $value ) && in_array( $value, array( 'yes', 'no' ), true ) ) {
			return $value;
		}

		return ! empty( $value ) ? 'yes' : 'no';
	}
}
