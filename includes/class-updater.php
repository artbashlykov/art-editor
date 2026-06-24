<?php
/**
 * GitHub update checker for ART Editor.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Updater
 */
class Art_Editor_Updater {

	const GITHUB_REPO = 'artbashlykov/art-editor';

	/**
	 * @var object|null
	 */
	private static $checker = null;

	/**
	 * Register update checker.
	 */
	public static function init() {
		$library = ART_EDITOR_PLUGIN_DIR . 'vendor/' . 'plugin-' . 'update-checker' . '/' . 'plugin-' . 'update-checker.php';

		if ( ! file_exists( $library ) ) {
			return;
		}

		require_once $library;

		$factory_class = '\\' . 'Yahnis' . 'Elsts\\Plugin' . 'UpdateChecker\\v5p7\\' . 'PucFactory';
		$build_method  = 'build' . 'UpdateChecker';

		if ( ! class_exists( $factory_class ) || ! is_callable( array( $factory_class, $build_method ) ) ) {
			return;
		}

		$checker = call_user_func(
			array( $factory_class, $build_method ),
			'https://github.com/' . self::GITHUB_REPO . '/',
			ART_EDITOR_PLUGIN_FILE,
			ART_EDITOR_ADMIN_MENU_SLUG
		);

		$checker->addFilter( 'view_details_link', '__return_empty_string' );
		$checker->addFilter( 'request_info_options', array( __CLASS__, 'filter_api_request_options' ) );
		$checker->getVcsApi()->enableReleaseAssets( '/\.zip($|[?&#])/i' );

		$token = self::get_github_token();

		if ( '' !== $token ) {
			$checker->setAuthentication( $token );
		}

		self::$checker = $checker;
	}

	/**
	 * Add GitHub-required headers to Plugin Update Checker API requests.
	 *
	 * @param array<string, mixed> $options wp_remote_get() options.
	 * @return array<string, mixed>
	 */
	public static function filter_api_request_options( $options ) {
		if ( ! is_array( $options ) ) {
			$options = array();
		}

		if ( ! isset( $options['headers'] ) || ! is_array( $options['headers'] ) ) {
			$options['headers'] = array();
		}

		$options['headers']['Accept']     = 'application/vnd.github+json';
		$options['headers']['User-Agent'] = 'ART-Editor/' . ART_EDITOR_VERSION;

		$token = self::get_github_token();

		if ( '' !== $token ) {
			$options['headers']['Authorization'] = 'Bearer ' . $token;
		}

		return $options;
	}

	/**
	 * GitHub token for private repository access.
	 *
	 * Add to wp-config.php:
	 * define( 'ART_EDITOR_GITHUB_TOKEN', 'your-github-token' );
	 *
	 * @return string
	 */
	private static function get_github_token() {
		$token = '';

		if ( defined( 'ART_EDITOR_GITHUB_TOKEN' ) ) {
			$token = (string) ART_EDITOR_GITHUB_TOKEN;
		}

		/**
		 * Filters GitHub token used to check ART Editor updates.
		 *
		 * @param string $token GitHub personal access token.
		 */
		$token = (string) apply_filters( 'art_editor_github_token', $token );

		return sanitize_text_field( $token );
	}
}
