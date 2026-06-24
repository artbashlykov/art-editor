<?php
/**
 * Build GitHub Release zip for ART Editor.
 *
 * Usage: php scripts/build-release.php [output-path]
 *
 * @package Art_Editor
 */

if ( 'cli' === PHP_SAPI && ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ );
}

defined( 'ABSPATH' ) || exit;

/**
 * Write a message to STDERR in CLI mode.
 *
 * @param string $art_editor_message Message text.
 */
function art_editor_build_release_stderr( $art_editor_message ) {
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- CLI build script only.
	fwrite( STDERR, $art_editor_message );
}

/**
 * Build release zip archive.
 *
 * @param array<int, string> $art_editor_argv CLI arguments.
 * @return int Exit code.
 */
function art_editor_build_release( array $art_editor_argv ) {
	if ( ! class_exists( 'ZipArchive' ) ) {
		art_editor_build_release_stderr( "ZipArchive is required.\n" );
		return 1;
	}

	$art_editor_plugin_dir = dirname( __DIR__ );
	$art_editor_slug       = basename( $art_editor_plugin_dir );
	$art_editor_output     = $art_editor_argv[1] ?? ( sys_get_temp_dir() . DIRECTORY_SEPARATOR . $art_editor_slug . '.zip' );

	$art_editor_exclude_dirs          = array( '.git', '.cursor', '.idea', '.vscode', 'node_modules', 'scripts' );
	$art_editor_exclude_file_patterns = array(
		'*.zip',
		'*.log',
		'tmp-*.php',
		'local-*.php',
	);

	/**
	 * Whether a path should be excluded from the release archive.
	 *
	 * @param string $art_editor_relative_path Path relative to plugin root.
	 */
	$art_editor_should_exclude = static function ( $art_editor_relative_path ) use ( $art_editor_exclude_dirs, $art_editor_exclude_file_patterns ) {
		$art_editor_relative_path = str_replace( '\\', '/', $art_editor_relative_path );
		$art_editor_parts         = explode( '/', $art_editor_relative_path );

		foreach ( $art_editor_parts as $art_editor_part ) {
			if ( in_array( $art_editor_part, $art_editor_exclude_dirs, true ) ) {
				return true;
			}
		}

		$art_editor_basename = basename( $art_editor_relative_path );
		foreach ( $art_editor_exclude_file_patterns as $art_editor_pattern ) {
			if ( fnmatch( $art_editor_pattern, $art_editor_basename ) ) {
				return true;
			}
		}

		return false;
	};

	$art_editor_zip    = new ZipArchive();
	$art_editor_opened = $art_editor_zip->open( $art_editor_output, ZipArchive::OVERWRITE | ZipArchive::CREATE );

	if ( true !== $art_editor_opened ) {
		art_editor_build_release_stderr( 'Cannot create zip: ' . $art_editor_output . "\n" );
		return 1;
	}

	$art_editor_iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $art_editor_plugin_dir, RecursiveDirectoryIterator::SKIP_DOTS )
	);

	foreach ( $art_editor_iterator as $art_editor_file_info ) {
		/**
		 * SplFileInfo instance for the current archive entry.
		 *
		 * @var SplFileInfo $art_editor_file_info
		 */
		$art_editor_absolute_path = $art_editor_file_info->getPathname();
		$art_editor_relative_path = substr( $art_editor_absolute_path, strlen( $art_editor_plugin_dir ) + 1 );

		if ( $art_editor_should_exclude( $art_editor_relative_path ) ) {
			continue;
		}

		$art_editor_zip_path = $art_editor_slug . '/' . str_replace( '\\', '/', $art_editor_relative_path );

		if ( $art_editor_file_info->isDir() ) {
			$art_editor_zip->addEmptyDir( rtrim( $art_editor_zip_path, '/' ) );
			continue;
		}

		$art_editor_zip->addFile( $art_editor_absolute_path, $art_editor_zip_path );
	}

	$art_editor_zip->close();

	// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- CLI outputs a local filesystem path.
	echo $art_editor_output, PHP_EOL;

	return 0;
}

if ( 'cli' !== PHP_SAPI ) {
	exit;
}

// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- CLI exit code, not rendered output.
exit( art_editor_build_release( $argv ) );
