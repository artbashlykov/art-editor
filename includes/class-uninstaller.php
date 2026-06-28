<?php
/**
 * Plugin uninstall cleanup.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Uninstaller
 */
class Art_Editor_Uninstaller {

	const DELETE_DATA_OPTION = 'art_editor_delete_data_on_uninstall';

	const PUC_OPTION = 'external_updates-art-editor';

	const PUC_CRON_HOOK = 'puc_cron_check_updates-art-editor';

	const PUC_ERROR_TRANSIENT = 'puc_manual_check_errors-art-editor';

	const POST_META_KEYS = array(
		'_art_editor_edit_mode',
		'_art_editor_layout_mode',
		'_art_editor_style_mode',
		'_art_editor_embedded_blocks',
	);

	/**
	 * Run uninstall cleanup when the admin opted in.
	 */
	public static function run() {
		if ( ! self::is_delete_data_enabled() ) {
			return;
		}

		self::delete_art_landing_posts();
		self::delete_post_meta();
		self::clear_cron();
		self::delete_plugin_options();
		self::delete_transients();
	}

	/**
	 * Whether the site admin enabled data removal on uninstall.
	 *
	 * @return bool
	 */
	private static function is_delete_data_enabled() {
		return 'yes' === get_option( self::DELETE_DATA_OPTION, 'no' );
	}

	/**
	 * Delete plugin-owned landing pages and their meta.
	 */
	private static function delete_art_landing_posts() {
		$post_ids = get_posts(
			array(
				'post_type'      => 'art_landing',
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'fields'         => 'ids',
			)
		);

		foreach ( $post_ids as $post_id ) {
			wp_delete_post( (int) $post_id, true );
		}
	}

	/**
	 * Delete ART Editor post meta from all post types.
	 */
	private static function delete_post_meta() {
		foreach ( self::POST_META_KEYS as $meta_key ) {
			delete_metadata( 'post', 0, $meta_key, '', true );
		}
	}

	/**
	 * Clear scheduled Plugin Update Checker events.
	 */
	private static function clear_cron() {
		$timestamp = wp_next_scheduled( self::PUC_CRON_HOOK );

		while ( $timestamp ) {
			wp_unschedule_event( $timestamp, self::PUC_CRON_HOOK );
			$timestamp = wp_next_scheduled( self::PUC_CRON_HOOK );
		}
	}

	/**
	 * Delete plugin options from the database.
	 */
	private static function delete_plugin_options() {
		global $wpdb;

		delete_option( self::PUC_OPTION );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Bulk cleanup during uninstall.
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
				$wpdb->esc_like( 'art_editor_' ) . '%'
			)
		);
	}

	/**
	 * Delete plugin transients and site transients.
	 */
	private static function delete_transients() {
		global $wpdb;

		$patterns = array(
			$wpdb->esc_like( '_transient_' . self::PUC_ERROR_TRANSIENT ) . '%',
			$wpdb->esc_like( '_transient_timeout_' . self::PUC_ERROR_TRANSIENT ) . '%',
			$wpdb->esc_like( '_site_transient_' . self::PUC_ERROR_TRANSIENT ) . '%',
			$wpdb->esc_like( '_site_transient_timeout_' . self::PUC_ERROR_TRANSIENT ) . '%',
			$wpdb->esc_like( '_transient_puc_' ) . '%art-editor%',
			$wpdb->esc_like( '_transient_timeout_puc_' ) . '%art-editor%',
			$wpdb->esc_like( '_site_transient_puc_' ) . '%art-editor%',
			$wpdb->esc_like( '_site_transient_timeout_puc_' ) . '%art-editor%',
		);

		foreach ( $patterns as $pattern ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Bulk cleanup during uninstall.
			$wpdb->query(
				$wpdb->prepare(
					"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
					$pattern
				)
			);
		}
	}
}
