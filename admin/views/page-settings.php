<?php
/**
 * ART Editor settings page.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

$art_editor_settings_option = Art_Editor_Settings::OPTION;
$art_editor_enabled_types   = Art_Editor_Settings::get_enabled_post_types();
$art_editor_post_types      = Art_Editor_Settings::get_selectable_post_types();

?>
<div class="wrap art-editor-admin">
	<h1><?php echo esc_html__( 'ART Editor — Настройки', 'art-editor' ); ?></h1>

	<form method="post" action="options.php" class="art-editor-settings-form">
		<?php
		settings_fields( 'art_editor_settings_group' );
		do_settings_sections( 'art_editor_settings_group' );
		?>

		<div class="art-editor-panel">
			<h2 class="art-editor-panel__title"><?php echo esc_html__( 'Общие', 'art-editor' ); ?></h2>

			<div class="art-editor-settings-section">
				<div class="art-editor-settings-row">
					<div class="art-editor-settings-row__label" id="art-editor-settings-post-types-label">
						<?php echo esc_html__( 'Типы записей', 'art-editor' ); ?>
					</div>
					<fieldset class="art-editor-settings-row__field" aria-labelledby="art-editor-settings-post-types-label">
						<legend class="screen-reader-text"><?php echo esc_html__( 'Типы записей', 'art-editor' ); ?></legend>
						<ul class="art-editor-settings-checklist">
							<?php foreach ( $art_editor_post_types as $art_editor_post_type_object ) : ?>
								<?php if ( ! $art_editor_post_type_object instanceof WP_Post_Type ) : ?>
									<?php continue; ?>
								<?php endif; ?>
								<li class="art-editor-settings-checklist__item">
									<label class="art-editor-settings-checklist__label" for="art-editor-post-type-<?php echo esc_attr( $art_editor_post_type_object->name ); ?>">
										<input
											type="checkbox"
											class="art-editor-settings-checklist__input"
											id="art-editor-post-type-<?php echo esc_attr( $art_editor_post_type_object->name ); ?>"
											name="<?php echo esc_attr( $art_editor_settings_option ); ?>[post_types][]"
											value="<?php echo esc_attr( $art_editor_post_type_object->name ); ?>"
											<?php checked( in_array( $art_editor_post_type_object->name, $art_editor_enabled_types, true ) ); ?>
										/>
										<span><?php echo esc_html( $art_editor_post_type_object->labels->name ); ?></span>
									</label>
								</li>
							<?php endforeach; ?>
						</ul>
						<p class="description">
							<?php echo esc_html__( 'Выберите типы записей, для которых в Gutenberg будет доступен АРТ Редактор.', 'art-editor' ); ?>
						</p>
					</fieldset>
				</div>
			</div>
		</div>

		<div class="art-editor-panel">
			<h2 class="art-editor-panel__title"><?php echo esc_html__( 'Данные при удалении', 'art-editor' ); ?></h2>

			<div class="art-editor-settings-section">
				<div class="art-editor-settings-row">
					<div class="art-editor-settings-row__label" id="art-editor-settings-delete-data-label">
						<?php echo esc_html__( 'Удаление данных', 'art-editor' ); ?>
					</div>
					<fieldset class="art-editor-settings-row__field" aria-labelledby="art-editor-settings-delete-data-label">
						<legend class="screen-reader-text"><?php echo esc_html__( 'Данные при удалении', 'art-editor' ); ?></legend>
						<label class="art-editor-settings-checklist__label" for="art-editor-delete-data-on-uninstall">
							<input
								type="hidden"
								name="<?php echo esc_attr( $art_editor_settings_option ); ?>[delete_data_on_uninstall]"
								value="0"
							/>
							<input
								type="checkbox"
								class="art-editor-settings-checklist__input"
								id="art-editor-delete-data-on-uninstall"
								name="<?php echo esc_attr( $art_editor_settings_option ); ?>[delete_data_on_uninstall]"
								value="1"
								<?php checked( Art_Editor_Settings::delete_data_on_uninstall_enabled() ); ?>
							/>
							<span><?php echo esc_html__( 'Удалять все данные плагина при удалении плагина', 'art-editor' ); ?></span>
						</label>
						<p class="description">
							<?php echo esc_html__( 'Если включено, при удалении плагина через экран «Плагины» будут безвозвратно удалены настройки ART Editor, мета-данные записей, лендинги типа art_landing, служебные данные обновлений и cron. Страницы, записи и их контент не удаляются.', 'art-editor' ); ?>
						</p>
					</fieldset>
				</div>
			</div>
		</div>

		<?php submit_button( __( 'Сохранить изменения', 'art-editor' ) ); ?>
	</form>
</div>
