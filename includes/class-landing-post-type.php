<?php
/**
 * Landing page custom post type.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Landing_Post_Type
 */
class Art_Editor_Landing_Post_Type {

	const POST_TYPE     = 'art_landing';
	const REWRITE_SLUG  = 'lp';
	const OPTION_FLUSH  = 'art_editor_rewrite_version';

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register_post_type' ), 0 );
		add_action( 'init', array( __CLASS__, 'maybe_flush_rewrites' ), 99 );
	}

	/**
	 * Register the landing post type.
	 */
	public static function register_post_type() {
		$labels = array(
			'name'               => __( 'Лендинги', 'art-editor' ),
			'singular_name'      => __( 'Лендинг', 'art-editor' ),
			'add_new'            => __( 'Добавить', 'art-editor' ),
			'add_new_item'       => __( 'Добавить лендинг', 'art-editor' ),
			'edit_item'          => __( 'Редактировать лендинг', 'art-editor' ),
			'new_item'           => __( 'Новый лендинг', 'art-editor' ),
			'view_item'          => __( 'Просмотреть лендинг', 'art-editor' ),
			'search_items'       => __( 'Искать лендинги', 'art-editor' ),
			'not_found'          => __( 'Лендинги не найдены', 'art-editor' ),
			'not_found_in_trash' => __( 'В корзине лендингов нет', 'art-editor' ),
			'menu_name'          => __( 'Лендинги', 'art-editor' ),
		);

		register_post_type(
			self::POST_TYPE,
			array(
				'labels'              => $labels,
				'public'              => true,
				'publicly_queryable'  => true,
				'exclude_from_search' => true,
				'show_ui'             => true,
				'show_in_menu'        => false,
				'show_in_rest'        => true,
				'query_var'           => true,
				'rewrite'             => array(
					'slug'       => self::REWRITE_SLUG,
					'with_front' => false,
				),
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
				'has_archive'         => false,
				'hierarchical'        => false,
				'supports'            => array( 'title', 'editor', 'revisions' ),
			)
		);
	}

	/**
	 * Flush rewrite rules when the landing CPT definition changes.
	 */
	public static function maybe_flush_rewrites() {
		$version         = get_option( self::OPTION_FLUSH, '' );
		$rewrite_version = ART_EDITOR_VERSION . '|' . self::POST_TYPE . '|' . self::REWRITE_SLUG;

		if ( $rewrite_version === $version ) {
			return;
		}

		flush_rewrite_rules( false );
		update_option( self::OPTION_FLUSH, $rewrite_version, false );
	}
}
