<?php
/**
 * Per-post ART Editor metadata.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Post_Meta
 */
class Art_Editor_Post_Meta {

	const META_EDIT_MODE   = '_art_editor_edit_mode';
	const META_LAYOUT_MODE = '_art_editor_layout_mode';
	const META_STYLE_MODE  = '_art_editor_style_mode';

	const EDIT_MODE_BUILDER = 'builder';
	const LAYOUT_THEME      = 'theme';
	const LAYOUT_CANVAS     = 'canvas';
	const STYLE_THEME       = 'theme';
	const STYLE_EDITOR      = 'editor';

	/**
	 * Default layout mode for posts managed by ART Editor.
	 *
	 * @return string
	 */
	public static function get_default_layout_mode() {
		return self::LAYOUT_CANVAS;
	}

	/**
	 * Default style mode for posts managed by ART Editor.
	 *
	 * @return string
	 */
	public static function get_default_style_mode() {
		return self::STYLE_EDITOR;
	}

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register_meta' ), 20 );
	}

	/**
	 * Register post meta used by the editor and frontend guards.
	 */
	public static function register_meta() {
		$edit_mode_args = array(
			'type'              => 'string',
			'description'       => __( 'Режим редактирования ART Editor для записи.', 'art-editor' ),
			'single'            => true,
			'default'           => '',
			'sanitize_callback' => array( __CLASS__, 'sanitize_edit_mode' ),
			'show_in_rest'      => true,
			'auth_callback'     => array( __CLASS__, 'meta_auth_callback' ),
		);

		$layout_args = array(
			'type'              => 'string',
			'description'       => __( 'Режим вывода страницы для ART Editor.', 'art-editor' ),
			'single'            => true,
			'default'           => self::LAYOUT_THEME,
			'sanitize_callback' => array( __CLASS__, 'sanitize_layout_mode' ),
			'show_in_rest'      => true,
			'auth_callback'     => array( __CLASS__, 'meta_auth_callback' ),
		);

		$style_args = array(
			'type'              => 'string',
			'description'       => __( 'Режим наследования стилей темы для ART Editor.', 'art-editor' ),
			'single'            => true,
			'default'           => self::STYLE_THEME,
			'sanitize_callback' => array( __CLASS__, 'sanitize_style_mode' ),
			'show_in_rest'      => true,
			'auth_callback'     => array( __CLASS__, 'meta_auth_callback' ),
		);

		register_post_meta( '', self::META_EDIT_MODE, $edit_mode_args );
		register_post_meta( '', self::META_LAYOUT_MODE, $layout_args );
		register_post_meta( '', self::META_STYLE_MODE, $style_args );
	}

	/**
	 * Restrict meta editing to users who can edit the post.
	 *
	 * @param bool   $allowed  Whether the user can add the meta.
	 * @param string $meta_key Meta key.
	 * @param int    $post_id  Post ID.
	 * @return bool
	 */
	public static function meta_auth_callback( $allowed, $meta_key, $post_id ) {
		unset( $allowed, $meta_key );

		return current_user_can( 'edit_post', (int) $post_id );
	}

	/**
	 * Sanitize edit mode meta.
	 *
	 * @param string $value Raw value.
	 * @return string
	 */
	public static function sanitize_edit_mode( $value ) {
		$value = sanitize_key( $value );

		return self::EDIT_MODE_BUILDER === $value ? self::EDIT_MODE_BUILDER : '';
	}

	/**
	 * Sanitize layout mode meta.
	 *
	 * @param string $value Raw value.
	 * @return string
	 */
	public static function sanitize_layout_mode( $value ) {
		$value = sanitize_key( $value );

		return in_array( $value, array( self::LAYOUT_THEME, self::LAYOUT_CANVAS ), true ) ? $value : self::LAYOUT_THEME;
	}

	/**
	 * Sanitize style mode meta.
	 *
	 * @param string $value Raw value.
	 * @return string
	 */
	public static function sanitize_style_mode( $value ) {
		$value = sanitize_key( $value );

		return in_array( $value, array( self::STYLE_THEME, self::STYLE_EDITOR ), true ) ? $value : self::STYLE_THEME;
	}

	/**
	 * Whether the post was opened or saved in ART Editor.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function is_built_with_art_editor( $post_id ) {
		$post_id = (int) $post_id;

		if ( $post_id <= 0 ) {
			return false;
		}

		return self::EDIT_MODE_BUILDER === get_post_meta( $post_id, self::META_EDIT_MODE, true );
	}

	/**
	 * Mark the post as managed by ART Editor.
	 *
	 * @param int $post_id Post ID.
	 */
	public static function mark_as_art_editor( $post_id ) {
		$post_id = (int) $post_id;

		if ( $post_id <= 0 ) {
			return;
		}

		$was_art_editor = self::is_built_with_art_editor( $post_id );

		update_post_meta( $post_id, self::META_EDIT_MODE, self::EDIT_MODE_BUILDER );

		if ( ! $was_art_editor ) {
			self::ensure_default_page_settings( $post_id );
		}
	}

	/**
	 * Apply ART Editor defaults to a post that has no saved page settings yet.
	 *
	 * @param int $post_id Post ID.
	 */
	public static function ensure_default_page_settings( $post_id ) {
		$post_id = (int) $post_id;

		if ( $post_id <= 0 ) {
			return;
		}

		if ( ! metadata_exists( 'post', $post_id, self::META_LAYOUT_MODE ) ) {
			update_post_meta( $post_id, self::META_LAYOUT_MODE, self::get_default_layout_mode() );
		}

		if ( ! metadata_exists( 'post', $post_id, self::META_STYLE_MODE ) ) {
			update_post_meta( $post_id, self::META_STYLE_MODE, self::get_default_style_mode() );
		}
	}

	/**
	 * Whether frontend-only settings may apply to the post.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function should_apply_frontend_settings( $post_id ) {
		return self::is_built_with_art_editor( $post_id );
	}

	/**
	 * Get layout mode for a post.
	 *
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public static function get_layout_mode( $post_id ) {
		$post_id = (int) $post_id;

		if ( $post_id <= 0 ) {
			return self::LAYOUT_THEME;
		}

		if ( ! metadata_exists( 'post', $post_id, self::META_LAYOUT_MODE ) ) {
			if ( self::is_built_with_art_editor( $post_id ) ) {
				return self::get_default_layout_mode();
			}

			return self::LAYOUT_THEME;
		}

		$mode = get_post_meta( $post_id, self::META_LAYOUT_MODE, true );

		return self::sanitize_layout_mode( $mode );
	}

	/**
	 * Get style mode for a post.
	 *
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public static function get_style_mode( $post_id ) {
		$post_id = (int) $post_id;

		if ( $post_id <= 0 ) {
			return self::STYLE_THEME;
		}

		if ( ! metadata_exists( 'post', $post_id, self::META_STYLE_MODE ) ) {
			if ( self::is_built_with_art_editor( $post_id ) ) {
				return self::get_default_style_mode();
			}

			return self::STYLE_THEME;
		}

		$mode = get_post_meta( $post_id, self::META_STYLE_MODE, true );

		return self::sanitize_style_mode( $mode );
	}

	/**
	 * Resolve a post slug for saving.
	 *
	 * @param WP_Post     $post     Post object.
	 * @param string|null $raw_slug Raw slug from the client. Null means do not change.
	 * @return string|null|WP_Error Final slug, null when unchanged, or WP_Error.
	 */
	public static function resolve_post_slug( $post, $raw_slug ) {
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'art_editor_invalid_post', __( 'Запись не найдена.', 'art-editor' ), array( 'status' => 404 ) );
		}

		if ( null === $raw_slug ) {
			return null;
		}

		$slug = sanitize_title( (string) $raw_slug );

		if ( '' === $slug ) {
			return null;
		}

		if ( $slug === $post->post_name ) {
			return null;
		}

		if ( ! function_exists( 'wp_unique_post_slug' ) ) {
			require_once ABSPATH . 'wp-admin/includes/post.php';
		}

		return wp_unique_post_slug(
			$slug,
			$post->ID,
			$post->post_status,
			$post->post_type,
			$post->post_parent
		);
	}

	/**
	 * Persist layout and style modes for a post.
	 *
	 * @param int         $post_id      Post ID.
	 * @param string      $layout_mode  Layout mode.
	 * @param string      $style_mode   Style mode.
	 * @param string|null $title        Optional post title.
	 * @param string|null $status       Optional post status.
	 * @param string|null $slug         Optional post slug. Null means do not change.
	 * @return true|WP_Error
	 */
	public static function save_page_settings( $post_id, $layout_mode, $style_mode, $title = null, $status = null, $slug = null ) {
		$post_id = (int) $post_id;

		if ( $post_id <= 0 ) {
			return new WP_Error( 'art_editor_invalid_post', __( 'Запись не указана.', 'art-editor' ), array( 'status' => 400 ) );
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'art_editor_forbidden', __( 'У вас нет прав редактировать эту запись.', 'art-editor' ), array( 'status' => 403 ) );
		}

		$post = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'art_editor_post_not_found', __( 'Запись не найдена.', 'art-editor' ), array( 'status' => 404 ) );
		}

		update_post_meta( $post_id, self::META_LAYOUT_MODE, self::sanitize_layout_mode( $layout_mode ) );
		update_post_meta( $post_id, self::META_STYLE_MODE, self::sanitize_style_mode( $style_mode ) );

		$update_args = array(
			'ID' => $post_id,
		);
		$has_update  = false;

		if ( null !== $title ) {
			$update_args['post_title'] = sanitize_text_field( $title );
			$has_update                = true;
		}

		if ( null !== $status ) {
			$sanitized_status = self::sanitize_post_status( $status, $post_id );

			if ( is_wp_error( $sanitized_status ) ) {
				return $sanitized_status;
			}

			if ( $sanitized_status ) {
				$update_args['post_status'] = $sanitized_status;
				$has_update                 = true;
			}
		}

		if ( null !== $slug ) {
			$resolved_slug = self::resolve_post_slug( $post, $slug );

			if ( is_wp_error( $resolved_slug ) ) {
				return $resolved_slug;
			}

			if ( null !== $resolved_slug ) {
				$update_args['post_name'] = $resolved_slug;
				$has_update               = true;
			}
		}

		if ( $has_update ) {
			$result = wp_update_post( wp_slash( $update_args ), true );

			if ( is_wp_error( $result ) ) {
				return $result;
			}
		}

		return true;
	}

	/**
	 * Sanitize a post status for updates.
	 *
	 * @param string $status  Raw status.
	 * @param int    $post_id Post ID.
	 * @return string|WP_Error
	 */
	public static function sanitize_post_status( $status, $post_id ) {
		$post_id = (int) $post_id;
		$status  = sanitize_key( $status );
		$allowed = array( 'draft', 'publish', 'pending', 'private', 'future' );

		if ( ! in_array( $status, $allowed, true ) ) {
			return new WP_Error( 'art_editor_invalid_status', __( 'Недопустимый статус записи.', 'art-editor' ), array( 'status' => 400 ) );
		}

		if ( in_array( $status, array( 'publish', 'private', 'future' ), true ) && ! current_user_can( 'publish_post', $post_id ) ) {
			return new WP_Error( 'art_editor_forbidden_status', __( 'У вас нет прав публиковать эту запись.', 'art-editor' ), array( 'status' => 403 ) );
		}

		return $status;
	}

	/**
	 * Remove ART Editor builder flag from a post.
	 *
	 * @param int $post_id Post ID.
	 * @return true|WP_Error
	 */
	public static function leave_builder_mode( $post_id ) {
		$post_id = (int) $post_id;

		if ( $post_id <= 0 ) {
			return new WP_Error( 'art_editor_invalid_post', __( 'Запись не указана.', 'art-editor' ), array( 'status' => 400 ) );
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'art_editor_forbidden', __( 'У вас нет прав редактировать эту запись.', 'art-editor' ), array( 'status' => 403 ) );
		}

		delete_post_meta( $post_id, self::META_EDIT_MODE );

		return true;
	}
}
