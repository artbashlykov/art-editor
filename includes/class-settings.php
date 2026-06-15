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

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'maybe_seed_defaults' ) );
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
			'post_types' => array( 'post', 'page' ),
		);
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

		if ( ! is_array( $value ) ) {
			return $sanitized;
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

		return $sanitized;
	}
}
