<?php
/**
 * Plugin Name:       ART Editor
 * Description:       Простой редактор HTML блоков для создания красивых лендингов с помощью нейронок.
 * Version:           0.2.24
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Арт Башлыков
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       art-editor
 * Domain Path:       /languages
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

define( 'ART_EDITOR_VERSION', '0.2.24' );
define( 'ART_EDITOR_ADMIN_MENU_SLUG', 'art-editor' );
define( 'ART_EDITOR_AUTHOR_URL', 'https://forge.artbashlykov.ru' );
define( 'ART_EDITOR_PLUGIN_FILE', __FILE__ );
define( 'ART_EDITOR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'ART_EDITOR_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'ART_EDITOR_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

add_filter( 'puc_view_details_link-' . ART_EDITOR_ADMIN_MENU_SLUG, '__return_empty_string' );

require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-activator.php';
require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-deactivator.php';
require_once ART_EDITOR_PLUGIN_DIR . 'includes/class-plugin.php';

register_activation_hook( ART_EDITOR_PLUGIN_FILE, array( 'Art_Editor_Activator', 'activate' ) );
register_deactivation_hook( ART_EDITOR_PLUGIN_FILE, array( 'Art_Editor_Deactivator', 'deactivate' ) );

/**
 * Returns the main plugin instance.
 *
 * @return Art_Editor_Plugin
 */
function art_editor() {
	return Art_Editor_Plugin::instance();
}

art_editor()->run();
