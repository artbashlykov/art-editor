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
	 * Register update checker.
	 */
	public static function init() {
		if ( ! is_admin() ) {
			return;
		}

		$library = ART_EDITOR_PLUGIN_DIR . 'vendor/plugin-update-checker/plugin-update-checker.php';

		if ( ! file_exists( $library ) ) {
			return;
		}

		require_once $library;

		$checker = \YahnisElsts\PluginUpdateChecker\v5p7\PucFactory::buildUpdateChecker(
			'https://github.com/' . self::GITHUB_REPO . '/',
			ART_EDITOR_PLUGIN_FILE,
			ART_EDITOR_ADMIN_MENU_SLUG
		);

		$checker->addFilter( 'view_details_link', '__return_empty_string' );
		$checker->allowAutoupdateField();

		$checker->getVcsApi()->enableReleaseAssets( '/\.zip($|[?&#])/i' );

		$token = self::get_github_token();

		if ( '' !== $token ) {
			$checker->setAuthentication( $token );
		}
	}

	/**
	 * GitHub token for private repository access.
	 *
	 * Public repo updates work without a token. Add to wp-config.php only if needed:
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
