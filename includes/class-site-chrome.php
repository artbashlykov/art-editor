<?php
/**
 * Site-wide header/footer (site chrome) storage and public API helpers.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Site_Chrome
 */
class Art_Editor_Site_Chrome {

	const OPTION = 'art_editor_site_chrome';

	const META_FLAG = '_art_editor_site_chrome';

	const POST_SLUG = 'art-editor-site-chrome';

	const ZONE_HEADER = 'header';

	const ZONE_FOOTER = 'footer';

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'maybe_ensure_service_post' ), 5 );
		add_action( 'pre_get_posts', array( __CLASS__, 'exclude_from_landings_query' ) );
		add_filter( 'wp_count_posts', array( __CLASS__, 'adjust_landings_counts' ), 10, 3 );
		add_action( 'template_redirect', array( __CLASS__, 'block_frontend_access' ) );
		add_action( 'before_delete_post', array( __CLASS__, 'prevent_service_post_delete' ) );
		add_action( 'wp_trash_post', array( __CLASS__, 'prevent_service_post_delete' ) );
	}

	/**
	 * Default option payload.
	 *
	 * @return array{post_id:int,header_enabled:bool,footer_enabled:bool}
	 */
	public static function get_default_settings() {
		return array(
			'post_id'         => 0,
			'header_enabled'  => false,
			'footer_enabled'  => false,
		);
	}

	/**
	 * Read and normalize stored settings.
	 *
	 * @return array{post_id:int,header_enabled:bool,footer_enabled:bool}
	 */
	public static function get_settings() {
		$stored = get_option( self::OPTION, array() );

		if ( ! is_array( $stored ) ) {
			$stored = array();
		}

		$defaults = self::get_default_settings();

		return array(
			'post_id'        => isset( $stored['post_id'] ) ? absint( $stored['post_id'] ) : $defaults['post_id'],
			'header_enabled' => ! empty( $stored['header_enabled'] ),
			'footer_enabled' => ! empty( $stored['footer_enabled'] ),
		);
	}

	/**
	 * Persist settings (keeps unknown keys out).
	 *
	 * @param array $settings Raw settings.
	 * @return array{post_id:int,header_enabled:bool,footer_enabled:bool}
	 */
	public static function update_settings( $settings ) {
		$current = self::get_settings();

		if ( ! is_array( $settings ) ) {
			$settings = array();
		}

		$next = array(
			'post_id'        => array_key_exists( 'post_id', $settings ) ? absint( $settings['post_id'] ) : $current['post_id'],
			'header_enabled' => array_key_exists( 'header_enabled', $settings ) ? ! empty( $settings['header_enabled'] ) : $current['header_enabled'],
			'footer_enabled' => array_key_exists( 'footer_enabled', $settings ) ? ! empty( $settings['footer_enabled'] ) : $current['footer_enabled'],
		);

		update_option( self::OPTION, $next, false );

		return $next;
	}

	/**
	 * Whether a post is the site chrome service post.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function is_service_post( $post_id ) {
		$post_id = (int) $post_id;

		if ( $post_id <= 0 ) {
			return false;
		}

		$settings = self::get_settings();

		if ( $settings['post_id'] === $post_id ) {
			return true;
		}

		return '1' === (string) get_post_meta( $post_id, self::META_FLAG, true );
	}

	/**
	 * Ensure service post exists (idempotent).
	 */
	public static function maybe_ensure_service_post() {
		if ( ! post_type_exists( Art_Editor_Landing_Post_Type::POST_TYPE ) ) {
			return;
		}

		self::ensure_service_post();
	}

	/**
	 * Create or repair the service post and option pointer.
	 *
	 * @return int Post ID or 0 on failure.
	 */
	public static function ensure_service_post() {
		$settings = self::get_settings();
		$post_id  = (int) $settings['post_id'];
		$post     = $post_id > 0 ? get_post( $post_id ) : null;

		if ( ! $post instanceof WP_Post || Art_Editor_Landing_Post_Type::POST_TYPE !== $post->post_type ) {
			$post = self::find_existing_service_post();
		}

		if ( $post instanceof WP_Post ) {
			$post_id = (int) $post->ID;
			self::repair_service_post( $post_id );
		} else {
			$post_id = self::create_service_post();
		}

		if ( $post_id <= 0 ) {
			return 0;
		}

		if ( (int) $settings['post_id'] !== $post_id ) {
			self::update_settings(
				array(
					'post_id' => $post_id,
				)
			);
		}

		return $post_id;
	}

	/**
	 * Locate an existing chrome post by meta/slug.
	 *
	 * @return WP_Post|null
	 */
	private static function find_existing_service_post() {
		$by_meta = get_posts(
			array(
				'post_type'              => Art_Editor_Landing_Post_Type::POST_TYPE,
				'post_status'            => 'any',
				'posts_per_page'         => 1,
				'fields'                 => 'all',
				'meta_key'               => self::META_FLAG,
				'meta_value'             => '1',
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
				'suppress_filters'       => true,
			)
		);

		if ( ! empty( $by_meta[0] ) && $by_meta[0] instanceof WP_Post ) {
			return $by_meta[0];
		}

		$by_slug = get_posts(
			array(
				'post_type'              => Art_Editor_Landing_Post_Type::POST_TYPE,
				'post_status'            => 'any',
				'posts_per_page'         => 1,
				'name'                   => self::POST_SLUG,
				'no_found_rows'          => true,
				'update_post_meta_cache' => true,
				'update_post_term_cache' => false,
				'suppress_filters'       => true,
			)
		);

		if ( ! empty( $by_slug[0] ) && $by_slug[0] instanceof WP_Post ) {
			return $by_slug[0];
		}

		return null;
	}

	/**
	 * Create a fresh service post with two locked blocks.
	 *
	 * @return int
	 */
	private static function create_service_post() {
		$content = Art_Editor_Content::serialize_html_block_items( self::get_default_blocks_payload() );

		$post_id = wp_insert_post(
			wp_slash(
				array(
					'post_type'    => Art_Editor_Landing_Post_Type::POST_TYPE,
					'post_status'  => 'private',
					'post_title'   => __( 'Шапка и подвал', 'art-editor' ),
					'post_name'    => self::POST_SLUG,
					'post_content' => $content,
				)
			),
			true
		);

		if ( is_wp_error( $post_id ) || ! $post_id ) {
			return 0;
		}

		$post_id = (int) $post_id;

		update_post_meta( $post_id, self::META_FLAG, '1' );
		Art_Editor_Post_Meta::mark_as_art_editor( $post_id );
		update_post_meta( $post_id, Art_Editor_Post_Meta::META_LAYOUT_MODE, Art_Editor_Post_Meta::LAYOUT_CANVAS );
		update_post_meta( $post_id, Art_Editor_Post_Meta::META_STYLE_MODE, Art_Editor_Post_Meta::STYLE_EDITOR );

		return $post_id;
	}

	/**
	 * Keep meta/status/blocks shape healthy.
	 *
	 * @param int  $post_id        Post ID.
	 * @param bool $repair_blocks  Whether to reshape HTML blocks when roles are missing.
	 */
	private static function repair_service_post( $post_id, $repair_blocks = true ) {
		$post_id = (int) $post_id;
		$post    = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			return;
		}

		if ( '1' !== (string) get_post_meta( $post_id, self::META_FLAG, true ) ) {
			update_post_meta( $post_id, self::META_FLAG, '1' );
		}

		if ( ! Art_Editor_Post_Meta::is_built_with_art_editor( $post_id ) ) {
			Art_Editor_Post_Meta::mark_as_art_editor( $post_id );
		}

		$update = array();

		if ( 'private' !== $post->post_status && 'trash' !== $post->post_status ) {
			$update['post_status'] = 'private';
		}

		if ( self::POST_SLUG !== $post->post_name ) {
			$update['post_name'] = self::POST_SLUG;
		}

		if ( '' === trim( (string) $post->post_title ) ) {
			$update['post_title'] = __( 'Шапка и подвал', 'art-editor' );
		}

		if ( $repair_blocks ) {
			$blocks = Art_Editor_Content::get_html_blocks_from_post( $post );

			if ( ! self::blocks_match_chrome_shape( $blocks ) ) {
				$repaired = self::normalize_chrome_blocks_payload( $blocks );
				$update['post_content'] = Art_Editor_Content::serialize_html_block_items( $repaired );
			}
		}

		if ( ! empty( $update ) ) {
			$update['ID'] = $post_id;
			wp_update_post( wp_slash( $update ) );
		}
	}

	/**
	 * Default two-block payload.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function get_default_blocks_payload() {
		return array(
			array(
				'type'        => 'html',
				'title'       => __( 'Шапка', 'art-editor' ),
				'content'     => '',
				'hidden'      => false,
				'chromeRole'  => self::ZONE_HEADER,
			),
			array(
				'type'        => 'html',
				'title'       => __( 'Подвал', 'art-editor' ),
				'content'     => '',
				'hidden'      => false,
				'chromeRole'  => self::ZONE_FOOTER,
			),
		);
	}

	/**
	 * Whether blocks already have header + footer roles.
	 *
	 * @param array $blocks Blocks from get_html_blocks_from_post.
	 * @return bool
	 */
	private static function blocks_match_chrome_shape( $blocks ) {
		if ( ! is_array( $blocks ) || 2 !== count( $blocks ) ) {
			return false;
		}

		$header = isset( $blocks[0]['chromeRole'] ) ? $blocks[0]['chromeRole'] : '';
		$footer = isset( $blocks[1]['chromeRole'] ) ? $blocks[1]['chromeRole'] : '';

		return self::ZONE_HEADER === $header && self::ZONE_FOOTER === $footer;
	}

	/**
	 * Force exactly two chrome blocks, preserving content where possible.
	 *
	 * @param array $blocks Incoming blocks.
	 * @return array<int, array<string, mixed>>
	 */
	public static function normalize_chrome_blocks_payload( $blocks ) {
		$defaults = self::get_default_blocks_payload();
		$header   = $defaults[0];
		$footer   = $defaults[1];

		if ( ! is_array( $blocks ) ) {
			return $defaults;
		}

		foreach ( $blocks as $block ) {
			if ( ! is_array( $block ) ) {
				continue;
			}

			$role = isset( $block['chromeRole'] ) ? sanitize_key( (string) $block['chromeRole'] ) : '';

			if ( self::ZONE_HEADER === $role ) {
				$header['content'] = isset( $block['content'] ) ? (string) $block['content'] : '';
				$header['hidden']  = ! empty( $block['hidden'] );
			} elseif ( self::ZONE_FOOTER === $role ) {
				$footer['content'] = isset( $block['content'] ) ? (string) $block['content'] : '';
				$footer['hidden']  = ! empty( $block['hidden'] );
			}
		}

		// Fallback by position when roles were stripped.
		if ( '' === $header['content'] && isset( $blocks[0] ) && is_array( $blocks[0] ) && empty( $blocks[0]['chromeRole'] ) ) {
			$header['content'] = isset( $blocks[0]['content'] ) ? (string) $blocks[0]['content'] : '';
			$header['hidden']  = ! empty( $blocks[0]['hidden'] );
		}

		if ( '' === $footer['content'] && isset( $blocks[1] ) && is_array( $blocks[1] ) && empty( $blocks[1]['chromeRole'] ) ) {
			$footer['content'] = isset( $blocks[1]['content'] ) ? (string) $blocks[1]['content'] : '';
			$footer['hidden']  = ! empty( $blocks[1]['hidden'] );
		}

		return array( $header, $footer );
	}

	/**
	 * Service post object.
	 *
	 * @return WP_Post|null
	 */
	public static function get_service_post() {
		$settings = self::get_settings();
		$post_id  = (int) $settings['post_id'];

		if ( $post_id > 0 ) {
			$post = get_post( $post_id );

			if ( $post instanceof WP_Post && Art_Editor_Landing_Post_Type::POST_TYPE === $post->post_type ) {
				return $post;
			}
		}

		$post_id = self::ensure_service_post();

		if ( $post_id <= 0 ) {
			return null;
		}

		$post = get_post( $post_id );

		return $post instanceof WP_Post ? $post : null;
	}

	/**
	 * Editor URL for a chrome zone.
	 *
	 * @param string $zone header|footer.
	 * @return string
	 */
	public static function get_editor_url( $zone = self::ZONE_HEADER ) {
		$post_id = self::ensure_service_post();

		if ( $post_id <= 0 ) {
			return '';
		}

		$zone = self::sanitize_zone( $zone );
		$url  = Art_Editor_Block_Editor::get_edit_url( $post_id );

		return add_query_arg( 'art_editor_zone', $zone, $url );
	}

	/**
	 * Sanitize zone key.
	 *
	 * @param string $zone Raw zone.
	 * @return string
	 */
	public static function sanitize_zone( $zone ) {
		$zone = sanitize_key( (string) $zone );

		return self::ZONE_FOOTER === $zone ? self::ZONE_FOOTER : self::ZONE_HEADER;
	}

	/**
	 * HTML for a zone from the service post (ignores enabled toggle).
	 *
	 * @param WP_Post $post Post.
	 * @param string  $zone header|footer.
	 * @return string
	 */
	public static function get_zone_html_from_post( WP_Post $post, $zone ) {
		$zone   = self::sanitize_zone( $zone );
		$blocks = Art_Editor_Content::get_html_blocks_from_post( $post );

		foreach ( $blocks as $block ) {
			if ( ! is_array( $block ) ) {
				continue;
			}

			$role = isset( $block['chromeRole'] ) ? sanitize_key( (string) $block['chromeRole'] ) : '';

			if ( $role !== $zone ) {
				continue;
			}

			if ( ! empty( $block['hidden'] ) ) {
				return '';
			}

			return isset( $block['content'] ) ? (string) $block['content'] : '';
		}

		$index = self::ZONE_FOOTER === $zone ? 1 : 0;

		if ( empty( $blocks[ $index ] ) || ! is_array( $blocks[ $index ] ) ) {
			return '';
		}

		if ( ! empty( $blocks[ $index ]['hidden'] ) ) {
			return '';
		}

		return isset( $blocks[ $index ]['content'] ) ? (string) $blocks[ $index ]['content'] : '';
	}

	/**
	 * Public payload for a zone or null.
	 *
	 * @param string $zone header|footer.
	 * @return array{enabled:bool,html:string,updated:string}|null
	 */
	public static function get_zone_payload( $zone ) {
		$zone     = self::sanitize_zone( $zone );
		$settings = self::get_settings();
		$enabled  = self::ZONE_FOOTER === $zone ? ! empty( $settings['footer_enabled'] ) : ! empty( $settings['header_enabled'] );

		if ( ! $enabled ) {
			return null;
		}

		$post = self::get_service_post();

		if ( ! $post instanceof WP_Post ) {
			return null;
		}

		$html = trim( self::get_zone_html_from_post( $post, $zone ) );

		if ( '' === $html ) {
			return null;
		}

		return array(
			'enabled' => true,
			'html'    => $html,
			'updated' => (string) $post->post_modified_gmt,
		);
	}

	/**
	 * Exclude service post from Landings admin/front queries.
	 *
	 * @param WP_Query $query Query.
	 */
	public static function exclude_from_landings_query( $query ) {
		if ( ! $query instanceof WP_Query ) {
			return;
		}

		$post_type = $query->get( 'post_type' );

		if ( is_array( $post_type ) ) {
			if ( ! in_array( Art_Editor_Landing_Post_Type::POST_TYPE, $post_type, true ) ) {
				return;
			}
		} elseif ( Art_Editor_Landing_Post_Type::POST_TYPE !== $post_type ) {
			return;
		}

		// Allow direct lookups used by ensure/repair.
		if ( $query->get( 'name' ) || $query->get( 'p' ) || self::META_FLAG === $query->get( 'meta_key' ) ) {
			return;
		}

		$meta_query = $query->get( 'meta_query' );

		if ( ! is_array( $meta_query ) ) {
			$meta_query = array();
		}

		$meta_query[] = array(
			'key'     => self::META_FLAG,
			'compare' => 'NOT EXISTS',
		);

		$query->set( 'meta_query', $meta_query );
	}

	/**
	 * Adjust All/Private counts so the chrome post is invisible in Landings.
	 *
	 * @param object $counts    Counts object.
	 * @param string $type      Post type.
	 * @param string $perm      Permission.
	 * @return object
	 */
	public static function adjust_landings_counts( $counts, $type, $perm ) {
		unset( $perm );

		if ( Art_Editor_Landing_Post_Type::POST_TYPE !== $type || ! is_object( $counts ) ) {
			return $counts;
		}

		$settings = self::get_settings();
		$post_id  = (int) $settings['post_id'];

		if ( $post_id <= 0 ) {
			return $counts;
		}

		$post = get_post( $post_id );

		if ( ! $post instanceof WP_Post || ! self::is_service_post( $post_id ) ) {
			return $counts;
		}

		$status = $post->post_status;

		if ( isset( $counts->$status ) && (int) $counts->$status > 0 ) {
			$counts->$status = (int) $counts->$status - 1;
		}

		return $counts;
	}

	/**
	 * Service post is not a public landing.
	 */
	public static function block_frontend_access() {
		if ( is_admin() || ! is_singular( Art_Editor_Landing_Post_Type::POST_TYPE ) ) {
			return;
		}

		$post_id = (int) get_queried_object_id();

		if ( $post_id <= 0 || ! self::is_service_post( $post_id ) ) {
			return;
		}

		global $wp_query;
		$wp_query->set_404();
		status_header( 404 );
		nocache_headers();
	}

	/**
	 * Prevent accidental trash/delete of the chrome post.
	 *
	 * @param int $post_id Post ID.
	 */
	public static function prevent_service_post_delete( $post_id ) {
		if ( ! self::is_service_post( (int) $post_id ) ) {
			return;
		}

		if ( defined( 'WP_UNINSTALL_PLUGIN' ) || ! empty( $GLOBALS['art_editor_allow_chrome_delete'] ) ) {
			return;
		}

		wp_die(
			esc_html__( 'Служебную запись «Шапка и подвал» нельзя удалить. Отключите зоны на экране «Шапка и подвал».', 'art-editor' ),
			esc_html__( 'ART Editor', 'art-editor' ),
			array( 'response' => 403 )
		);
	}
}

/**
 * Public API: site header HTML payload for themes.
 *
 * @return array{enabled:bool,html:string,updated:string}|null
 */
function art_editor_get_site_header() {
	return Art_Editor_Site_Chrome::get_zone_payload( Art_Editor_Site_Chrome::ZONE_HEADER );
}

/**
 * Public API: site footer HTML payload for themes.
 *
 * @return array{enabled:bool,html:string,updated:string}|null
 */
function art_editor_get_site_footer() {
	return Art_Editor_Site_Chrome::get_zone_payload( Art_Editor_Site_Chrome::ZONE_FOOTER );
}
