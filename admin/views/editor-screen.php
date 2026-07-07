<?php
/**
 * Standalone ART Editor page template.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

global $art_editor_current_post;

$post = $art_editor_current_post;

if ( ! $post instanceof WP_Post ) {
	wp_die( esc_html__( 'Запись не найдена.', 'art-editor' ) );
}

$art_editor_document_title = Art_Editor_Editor_Screen::get_document_title( $post );
$art_editor_status_label   = Art_Editor_Editor_Screen::get_post_status_label( $post );
$art_editor_page_title     = sprintf(
	/* translators: %s: post title */
	__( 'АРТ Редактор: %s', 'art-editor' ),
	$art_editor_document_title
);
$art_editor_settings_status       = $post->post_status;
$art_editor_settings_title_value  = $post->post_title;
$art_editor_settings_layout_mode  = Art_Editor_Post_Meta::get_layout_mode( $post->ID );
$art_editor_settings_style_mode   = Art_Editor_Post_Meta::get_style_mode( $post->ID );
$art_editor_settings_statuses     = Art_Editor_Editor_Screen::get_available_post_statuses( $post );
$art_editor_permalink_settings    = Art_Editor_Editor_Screen::get_permalink_settings_data( $post );
$art_editor_settings_slug_value   = $art_editor_permalink_settings['slug'];
$art_editor_settings_permalink_prefix = $art_editor_permalink_settings['permalinkPrefix'];
$art_editor_settings_show_slug_hint = in_array( $art_editor_settings_status, array( 'publish', 'private' ), true );
$art_editor_can_publish           = current_user_can( 'publish_post', $post->ID );
$art_editor_show_publish_button   = $art_editor_can_publish && ! in_array( $art_editor_settings_status, array( 'publish', 'private' ), true );

if ( 'auto-draft' === $art_editor_settings_status ) {
	$art_editor_settings_status = 'draft';
}

?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title><?php echo esc_html( $art_editor_page_title ); ?></title>
	<?php
	// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Core site icon markup from wp_site_icon().
	echo Art_Editor_Editor_Screen::get_site_icon_head_markup();

	$editor_styles = array(
		'art-editor-brand',
		'art-editor-screen',
	);

	if ( wp_style_is( 'code-editor', 'enqueued' ) ) {
		$editor_styles[] = 'code-editor';
	}

	if ( wp_style_is( 'art-editor-codemirror-theme', 'enqueued' ) ) {
		$editor_styles[] = 'art-editor-codemirror-theme';
	}

	if ( wp_style_is( 'media-views', 'enqueued' ) ) {
		$editor_styles[] = 'media-views';
	}

	if ( wp_style_is( 'imgareaselect', 'enqueued' ) ) {
		$editor_styles[] = 'imgareaselect';
	}

	wp_print_styles( $editor_styles );
	?>
</head>
<body class="art-editor-screen">
	<header class="art-editor-screen__header">
		<div class="art-editor-screen__header-left">
			<a
				class="art-editor-screen__site-icon-link"
				href="<?php echo esc_url( Art_Editor_Editor_Screen::get_exit_url( $post ) ); ?>"
				aria-label="<?php echo esc_attr__( 'Вернуться к редактору WordPress', 'art-editor' ); ?>"
				title="<?php echo esc_attr__( 'Вернуться к редактору WordPress', 'art-editor' ); ?>"
			>
				<div class="art-editor-screen__site-icon-wrap">
					<?php
					// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Markup is escaped in helper.
					echo Art_Editor_Editor_Screen::get_site_icon_markup();
					?>
				</div>
			</a>
		</div>
		<div class="art-editor-screen__header-center">
			<button
				type="button"
				class="art-editor-screen__header-settings-button"
				id="art-editor-settings-toggle"
				aria-expanded="false"
				aria-controls="art-editor-settings-panel"
				title="<?php echo esc_attr__( 'Настройки страницы', 'art-editor' ); ?>"
			>
				<span class="screen-reader-text"><?php echo esc_html__( 'Открыть настройки страницы', 'art-editor' ); ?></span>
				<svg class="art-editor-screen__header-settings-button-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
					<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="2"></path>
					<path d="M19.4 15a7.97 7.97 0 0 0 .1-1 7.97 7.97 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8.1 8.1 0 0 0-1.7-1L15 2h-6l-.3 3a8.1 8.1 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.97 7.97 0 0 0-.1 1c0 .34.03.67.1 1l-2 1.5 2 3.5 2.4-1c.52.43 1.1.78 1.7 1L9 22h6l.3-3c.6-.22 1.18-.57 1.7-1l2.4 1 2-3.5-2-1.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
				</svg>
			</button>
			<span class="art-editor-screen__document-title" id="art-editor-document-title">
				<?php echo esc_html( $art_editor_document_title ); ?>
			</span>
			<span class="art-editor-screen__document-status" id="art-editor-document-status">
				<?php
				printf(
					'(%s)',
					esc_html( $art_editor_status_label )
				);
				?>
			</span>
			<span class="art-editor-screen__unsaved-indicator" id="art-editor-unsaved-indicator" hidden>
				<span class="art-editor-screen__unsaved-indicator-dot" aria-hidden="true">●</span>
				<span class="art-editor-screen__unsaved-indicator-text">
					<?php echo esc_html__( 'Несохранено', 'art-editor' ); ?>
				</span>
			</span>
		</div>
		<div class="art-editor-screen__header-right">
			<button
				type="button"
				class="art-editor-screen__icon-button"
				id="art-editor-preview-button"
				aria-label="<?php echo esc_attr__( 'Предпросмотр', 'art-editor' ); ?>"
				title="<?php echo esc_attr__( 'Предпросмотр', 'art-editor' ); ?>"
			>
				<svg class="art-editor-screen__icon-button-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
					<path d="M14 4h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
					<path d="M20 4 10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
					<path d="M10 20H4v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
					<path d="M4 20l10-10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
				</svg>
			</button>
			<button type="button" class="art-editor-screen__save-button<?php echo $art_editor_show_publish_button ? ' art-editor-screen__save-button--secondary' : ''; ?>" id="art-editor-save-button">
				<?php echo esc_html__( 'Сохранить', 'art-editor' ); ?>
			</button>
			<?php if ( $art_editor_can_publish ) : ?>
				<button
					type="button"
					class="art-editor-screen__save-button art-editor-screen__publish-button"
					id="art-editor-publish-button"
					<?php echo $art_editor_show_publish_button ? '' : 'hidden'; ?>
				>
					<?php echo esc_html__( 'Опубликовать', 'art-editor' ); ?>
				</button>
			<?php endif; ?>
		</div>
	</header>
	<main class="art-editor-screen__workspace">
		<aside class="art-editor-screen__sidebar art-editor-screen__sidebar--left">
			<div class="art-editor-screen__sidebar-view" id="art-editor-structure-view">
				<div class="art-editor-screen__sidebar-section art-editor-screen__sidebar-section--structure">
					<div class="art-editor-screen__sidebar-heading">
						<?php echo esc_html__( 'Структура', 'art-editor' ); ?>
					</div>
					<div class="art-editor-screen__history-buttons">
						<button
							type="button"
							class="art-editor-screen__history-button"
							id="art-editor-undo-button"
							aria-label="<?php echo esc_attr__( 'Отменить', 'art-editor' ); ?>"
							title="<?php echo esc_attr__( 'Отменить', 'art-editor' ); ?>"
							disabled
						>
							<svg class="art-editor-screen__history-button-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
								<path d="M9 7H5v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
								<path d="M5 11c1.2-3 4.2-5 8-5 4.4 0 8 3.6 8 8s-3.6 8-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
							</svg>
						</button>
						<button
							type="button"
							class="art-editor-screen__history-button"
							id="art-editor-redo-button"
							aria-label="<?php echo esc_attr__( 'Повторить', 'art-editor' ); ?>"
							title="<?php echo esc_attr__( 'Повторить', 'art-editor' ); ?>"
							disabled
						>
							<svg class="art-editor-screen__history-button-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
								<path d="M15 7h4v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
								<path d="M19 11c-1.2-3-4.2-5-8-5-4.4 0-8 3.6-8 8s3.6 8 8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
							</svg>
						</button>
					</div>
				</div>
				<div class="art-editor-screen__structure" id="art-editor-structure">
					<p class="art-editor-screen__structure-empty" id="art-editor-structure-empty">
						<?php echo esc_html__( 'HTML-блоки не найдены. Создайте первый блок.', 'art-editor' ); ?>
					</p>
					<ul class="art-editor-screen__structure-list" id="art-editor-structure-list"></ul>
				</div>
				<div class="art-editor-screen__sidebar-footer">
					<button type="button" class="art-editor-screen__sidebar-button art-editor-screen__sidebar-button--secondary" id="art-editor-create-anchor">
						<?php echo esc_html__( 'Добавить якорь', 'art-editor' ); ?>
					</button>
					<button type="button" class="art-editor-screen__sidebar-button" id="art-editor-create-html">
						<?php echo esc_html__( 'Создать HTML', 'art-editor' ); ?>
					</button>
				</div>
			</div>
			<div class="art-editor-screen__sidebar-view art-editor-screen__sidebar-settings" id="art-editor-settings-panel" hidden>
				<div class="art-editor-screen__sidebar-section art-editor-screen__sidebar-section--settings">
					<div class="art-editor-screen__sidebar-heading">
						<?php echo esc_html__( 'Настройки страницы', 'art-editor' ); ?>
					</div>
					<button
						type="button"
						class="art-editor-screen__settings-close"
						id="art-editor-settings-close"
						aria-label="<?php echo esc_attr__( 'Закрыть настройки', 'art-editor' ); ?>"
						title="<?php echo esc_attr__( 'Закрыть настройки', 'art-editor' ); ?>"
					>
						<svg class="art-editor-screen__settings-close-svg" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
							<path d="M2 2 10 10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
							<path d="m10 2-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
						</svg>
					</button>
				</div>
				<div class="art-editor-screen__sidebar-settings-body">
					<div class="art-editor-screen__settings-section">
						<div class="art-editor-screen__settings-section-title">
							<?php echo esc_html__( 'Основные настройки', 'art-editor' ); ?>
						</div>
						<div class="art-editor-screen__settings-field art-editor-screen__settings-field--stacked">
							<label class="art-editor-screen__settings-label" for="art-editor-page-title">
								<?php echo esc_html__( 'Заголовок', 'art-editor' ); ?>
							</label>
							<input
								type="text"
								class="art-editor-screen__settings-input"
								id="art-editor-page-title"
								name="art-editor-page-title"
								value="<?php echo esc_attr( $art_editor_settings_title_value ); ?>"
								placeholder="<?php echo esc_attr__( 'Без названия', 'art-editor' ); ?>"
								autocomplete="off"
							/>
						</div>
						<div class="art-editor-screen__settings-field art-editor-screen__settings-field--stacked">
							<label class="art-editor-screen__settings-label" for="art-editor-page-slug">
								<?php echo esc_html__( 'Адрес', 'art-editor' ); ?>
							</label>
							<div class="art-editor-screen__permalink-editor">
								<span
									class="art-editor-screen__permalink-prefix"
									id="art-editor-permalink-prefix"
									title="<?php echo esc_attr( $art_editor_settings_permalink_prefix . $art_editor_settings_slug_value ); ?>"
								>
									<?php echo esc_html( $art_editor_settings_permalink_prefix ); ?>
								</span>
								<input
									type="text"
									class="art-editor-screen__settings-input art-editor-screen__permalink-slug"
									id="art-editor-page-slug"
									name="art-editor-page-slug"
									value="<?php echo esc_attr( $art_editor_settings_slug_value ); ?>"
									placeholder="<?php echo esc_attr__( 'ярлык-страницы', 'art-editor' ); ?>"
									autocomplete="off"
									spellcheck="false"
								/>
							</div>
							<p
								class="art-editor-screen__permalink-hint"
								id="art-editor-permalink-hint"
								<?php echo $art_editor_settings_show_slug_hint ? '' : 'hidden'; ?>
							>
								<?php echo esc_html__( 'После сохранения старый адрес перестанет работать.', 'art-editor' ); ?>
							</p>
						</div>
						<div class="art-editor-screen__settings-field art-editor-screen__settings-field--inline">
							<label class="art-editor-screen__settings-label" for="art-editor-page-status">
								<?php echo esc_html__( 'Статус', 'art-editor' ); ?>
							</label>
							<select
								class="art-editor-screen__settings-select"
								id="art-editor-page-status"
								name="art-editor-page-status"
								disabled
								aria-disabled="true"
								title="<?php echo esc_attr__( 'Статус меняется кнопкой «Опубликовать» в шапке.', 'art-editor' ); ?>"
							>
								<?php foreach ( $art_editor_settings_statuses as $art_editor_status_key => $art_editor_status_name ) : ?>
									<option value="<?php echo esc_attr( $art_editor_status_key ); ?>" <?php selected( $art_editor_settings_status, $art_editor_status_key ); ?>>
										<?php echo esc_html( $art_editor_status_name ); ?>
									</option>
								<?php endforeach; ?>
							</select>
						</div>
						<div class="art-editor-screen__settings-field art-editor-screen__settings-field--inline">
							<label class="art-editor-screen__settings-label" for="art-editor-layout-mode">
								<?php echo esc_html__( 'Шаблон', 'art-editor' ); ?>
							</label>
							<select class="art-editor-screen__settings-select" id="art-editor-layout-mode" name="art-editor-layout-mode">
								<option value="theme" <?php selected( $art_editor_settings_layout_mode, 'theme' ); ?>>
									<?php echo esc_html__( 'Наследовать тему', 'art-editor' ); ?>
								</option>
								<option value="canvas" <?php selected( $art_editor_settings_layout_mode, 'canvas' ); ?>>
									<?php echo esc_html__( 'Без шапки и подвала', 'art-editor' ); ?>
								</option>
							</select>
						</div>
						<div class="art-editor-screen__settings-field art-editor-screen__settings-field--inline">
							<label class="art-editor-screen__settings-label" for="art-editor-style-mode">
								<?php echo esc_html__( 'Стили', 'art-editor' ); ?>
							</label>
							<select class="art-editor-screen__settings-select" id="art-editor-style-mode" name="art-editor-style-mode">
								<option value="theme" <?php selected( $art_editor_settings_style_mode, 'theme' ); ?>>
									<?php echo esc_html__( 'Стили темы', 'art-editor' ); ?>
								</option>
								<option value="editor" <?php selected( $art_editor_settings_style_mode, 'editor' ); ?>>
									<?php echo esc_html__( 'Стили редактора', 'art-editor' ); ?>
								</option>
							</select>
						</div>
					</div>
					<p class="art-editor-screen__settings-status" id="art-editor-settings-status" hidden></p>
				</div>
			</div>
			<div class="art-editor-screen__sidebar-view art-editor-screen__sidebar-element-editor" id="art-editor-element-panel" hidden>
				<div class="art-editor-screen__sidebar-section art-editor-screen__sidebar-section--element-editor">
					<div class="art-editor-screen__sidebar-heading">
						<?php echo esc_html__( 'Редактор элемента', 'art-editor' ); ?>
					</div>
					<button
						type="button"
						class="art-editor-screen__settings-close"
						id="art-editor-element-close"
						aria-label="<?php echo esc_attr__( 'Сбросить выбор элемента', 'art-editor' ); ?>"
						title="<?php echo esc_attr__( 'Сбросить выбор элемента', 'art-editor' ); ?>"
					>
						<svg class="art-editor-screen__settings-close-svg" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
							<path d="M2 2 10 10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
							<path d="m10 2-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>
						</svg>
					</button>
				</div>
				<div class="art-editor-screen__sidebar-element-editor-body">
					<div class="art-editor-screen__element-editor-selection">
						<p class="art-editor-screen__element-editor-summary" id="art-editor-element-summary" hidden></p>
						<button
							type="button"
							class="art-editor-screen__element-editor-parent"
							id="art-editor-element-parent"
							hidden
							disabled
						>
							<?php echo esc_html__( 'Родитель', 'art-editor' ); ?>
						</button>
					</div>
					<div class="art-editor-screen__element-editor-text-styles" id="art-editor-element-style-controls" hidden>
						<div class="art-editor-screen__element-editor-style-grid">
							<div class="art-editor-screen__element-editor-style-row" id="art-editor-element-font-size-row" hidden>
								<label class="art-editor-screen__element-editor-field-label" for="art-editor-element-font-size">
									<?php echo esc_html__( 'Размер шрифта', 'art-editor' ); ?>
								</label>
								<div class="art-editor-screen__element-editor-style-control">
									<input
										type="number"
										class="art-editor-screen__element-editor-style-input"
										id="art-editor-element-font-size"
										name="art-editor-element-font-size"
										min="1"
										max="200"
										step="1"
										inputmode="numeric"
										autocomplete="off"
										aria-label="<?php echo esc_attr__( 'Размер шрифта', 'art-editor' ); ?>"
									/>
									<button
										type="button"
										class="art-editor-screen__element-editor-style-reset"
										id="art-editor-element-font-size-reset"
										disabled
									>
										<?php echo esc_html__( 'Сбросить', 'art-editor' ); ?>
									</button>
								</div>
							</div>
							<div class="art-editor-screen__element-editor-style-row" id="art-editor-element-line-height-row" hidden>
								<label
									class="art-editor-screen__element-editor-field-label"
									for="art-editor-element-line-height"
									title="<?php echo esc_attr__( 'Межстрочный интервал', 'art-editor' ); ?>"
								>
									<?php echo esc_html__( 'Интервал', 'art-editor' ); ?>
								</label>
								<div class="art-editor-screen__element-editor-style-control">
									<div class="art-editor-screen__element-editor-style-value-group">
										<input
											type="number"
											class="art-editor-screen__element-editor-style-input"
											id="art-editor-element-line-height"
											name="art-editor-element-line-height"
											min="0.5"
											max="300"
											step="0.1"
											inputmode="decimal"
											autocomplete="off"
											aria-label="<?php echo esc_attr__( 'Межстрочный интервал', 'art-editor' ); ?>"
										/>
										<select
											class="art-editor-screen__element-editor-style-select art-editor-screen__element-editor-style-select--unit"
											id="art-editor-element-line-height-unit"
											name="art-editor-element-line-height-unit"
											aria-label="<?php echo esc_attr__( 'Единица межстрочного интервала', 'art-editor' ); ?>"
										>
											<option value="unitless"><?php echo esc_html__( '×', 'art-editor' ); ?></option>
											<option value="px">px</option>
											<option value="percent">%</option>
										</select>
									</div>
									<button
										type="button"
										class="art-editor-screen__element-editor-style-reset"
										id="art-editor-element-line-height-reset"
										disabled
									>
										<?php echo esc_html__( 'Сбросить', 'art-editor' ); ?>
									</button>
								</div>
							</div>
							<div class="art-editor-screen__element-editor-style-row" id="art-editor-element-text-color-row" hidden>
								<label class="art-editor-screen__element-editor-field-label" for="art-editor-element-text-color">
									<?php echo esc_html__( 'Цвет текста', 'art-editor' ); ?>
								</label>
								<div class="art-editor-screen__element-editor-style-control art-editor-screen__element-editor-style-control--color">
									<input
										type="color"
										class="art-editor-screen__element-editor-color-input"
										id="art-editor-element-text-color"
										name="art-editor-element-text-color"
										value="#000000"
										aria-label="<?php echo esc_attr__( 'Цвет текста', 'art-editor' ); ?>"
									/>
									<button
										type="button"
										class="art-editor-screen__element-editor-style-reset"
										id="art-editor-element-text-color-reset"
										disabled
									>
										<?php echo esc_html__( 'Сбросить', 'art-editor' ); ?>
									</button>
								</div>
							</div>
							<div class="art-editor-screen__element-editor-style-row" id="art-editor-element-font-weight-row" hidden>
								<label class="art-editor-screen__element-editor-field-label" for="art-editor-element-font-weight">
									<?php echo esc_html__( 'Жирность', 'art-editor' ); ?>
								</label>
								<div class="art-editor-screen__element-editor-style-control">
									<select
										class="art-editor-screen__element-editor-style-select"
										id="art-editor-element-font-weight"
										name="art-editor-element-font-weight"
										aria-label="<?php echo esc_attr__( 'Жирность', 'art-editor' ); ?>"
									>
										<option value=""><?php echo esc_html__( '—', 'art-editor' ); ?></option>
										<?php foreach ( array( 100, 200, 300, 400, 500, 600, 700, 800, 900 ) as $art_editor_font_weight ) : ?>
											<option value="<?php echo esc_attr( (string) $art_editor_font_weight ); ?>">
												<?php echo esc_html( (string) $art_editor_font_weight ); ?>
											</option>
										<?php endforeach; ?>
									</select>
									<button
										type="button"
										class="art-editor-screen__element-editor-style-reset"
										id="art-editor-element-font-weight-reset"
										disabled
									>
										<?php echo esc_html__( 'Сбросить', 'art-editor' ); ?>
									</button>
								</div>
							</div>
							<div class="art-editor-screen__element-editor-style-row" id="art-editor-element-text-decoration-row" hidden>
								<span class="art-editor-screen__element-editor-field-label" id="art-editor-element-text-decoration-label">
									<?php echo esc_html__( 'Оформление', 'art-editor' ); ?>
								</span>
								<div
									class="art-editor-screen__element-editor-style-control art-editor-screen__element-editor-toggle-group"
									role="group"
									aria-labelledby="art-editor-element-text-decoration-label"
								>
									<button
										type="button"
										class="art-editor-screen__element-editor-toggle art-editor-screen__element-editor-toggle--italic"
										id="art-editor-element-italic-toggle"
										aria-pressed="false"
										aria-label="<?php echo esc_attr__( 'Курсив', 'art-editor' ); ?>"
										title="<?php echo esc_attr__( 'Курсив', 'art-editor' ); ?>"
									>
										<em>I</em>
									</button>
									<button
										type="button"
										class="art-editor-screen__element-editor-toggle art-editor-screen__element-editor-toggle--underline"
										id="art-editor-element-underline-toggle"
										aria-pressed="false"
										aria-label="<?php echo esc_attr__( 'Подчёркивание', 'art-editor' ); ?>"
										title="<?php echo esc_attr__( 'Подчёркивание', 'art-editor' ); ?>"
									>
										<span aria-hidden="true">U</span>
									</button>
									<button
										type="button"
										class="art-editor-screen__element-editor-toggle art-editor-screen__element-editor-toggle--line-through"
										id="art-editor-element-line-through-toggle"
										aria-pressed="false"
										aria-label="<?php echo esc_attr__( 'Зачёркивание', 'art-editor' ); ?>"
										title="<?php echo esc_attr__( 'Зачёркивание', 'art-editor' ); ?>"
									>
										<span aria-hidden="true">S</span>
									</button>
								</div>
							</div>
							<div class="art-editor-screen__element-editor-style-row" id="art-editor-element-background-color-row" hidden>
								<label class="art-editor-screen__element-editor-field-label" for="art-editor-element-background-color">
									<?php echo esc_html__( 'Цвет фона', 'art-editor' ); ?>
								</label>
								<div class="art-editor-screen__element-editor-style-control art-editor-screen__element-editor-style-control--color">
									<input
										type="color"
										class="art-editor-screen__element-editor-color-input"
										id="art-editor-element-background-color"
										name="art-editor-element-background-color"
										value="#ffffff"
										aria-label="<?php echo esc_attr__( 'Цвет фона', 'art-editor' ); ?>"
									/>
									<button
										type="button"
										class="art-editor-screen__element-editor-style-reset"
										id="art-editor-element-background-color-reset"
										disabled
									>
										<?php echo esc_html__( 'Сбросить', 'art-editor' ); ?>
									</button>
								</div>
							</div>
							<hr class="art-editor-screen__element-editor-divider" id="art-editor-element-block-spacing-divider" hidden />
							<p class="art-editor-screen__element-editor-group-title" id="art-editor-element-padding-group-title" hidden>
								<?php echo esc_html__( 'Внутренние отступы', 'art-editor' ); ?>
							</p>
							<div class="art-editor-screen__element-editor-style-row" id="art-editor-element-padding-top-row" hidden>
								<label class="art-editor-screen__element-editor-field-label" for="art-editor-element-padding-top">
									<?php echo esc_html__( 'Отступ сверху', 'art-editor' ); ?>
								</label>
								<div class="art-editor-screen__element-editor-style-control">
									<input
										type="number"
										class="art-editor-screen__element-editor-style-input"
										id="art-editor-element-padding-top"
										name="art-editor-element-padding-top"
										min="0"
										max="500"
										step="1"
										inputmode="numeric"
										autocomplete="off"
										aria-label="<?php echo esc_attr__( 'Внутренний отступ сверху', 'art-editor' ); ?>"
									/>
									<button
										type="button"
										class="art-editor-screen__element-editor-style-reset"
										id="art-editor-element-padding-top-reset"
										disabled
									>
										<?php echo esc_html__( 'Сбросить', 'art-editor' ); ?>
									</button>
								</div>
							</div>
							<div class="art-editor-screen__element-editor-style-row" id="art-editor-element-padding-bottom-row" hidden>
								<label class="art-editor-screen__element-editor-field-label" for="art-editor-element-padding-bottom">
									<?php echo esc_html__( 'Отступ снизу', 'art-editor' ); ?>
								</label>
								<div class="art-editor-screen__element-editor-style-control">
									<input
										type="number"
										class="art-editor-screen__element-editor-style-input"
										id="art-editor-element-padding-bottom"
										name="art-editor-element-padding-bottom"
										min="0"
										max="500"
										step="1"
										inputmode="numeric"
										autocomplete="off"
										aria-label="<?php echo esc_attr__( 'Внутренний отступ снизу', 'art-editor' ); ?>"
									/>
									<button
										type="button"
										class="art-editor-screen__element-editor-style-reset"
										id="art-editor-element-padding-bottom-reset"
										disabled
									>
										<?php echo esc_html__( 'Сбросить', 'art-editor' ); ?>
									</button>
								</div>
							</div>
							<hr class="art-editor-screen__element-editor-divider" id="art-editor-element-margin-divider" hidden />
							<p class="art-editor-screen__element-editor-group-title" id="art-editor-element-margin-group-title" hidden>
								<?php echo esc_html__( 'Внешние отступы', 'art-editor' ); ?>
							</p>
							<div class="art-editor-screen__element-editor-style-row" id="art-editor-element-margin-top-row" hidden>
								<label class="art-editor-screen__element-editor-field-label" for="art-editor-element-margin-top">
									<?php echo esc_html__( 'Отступ сверху', 'art-editor' ); ?>
								</label>
								<div class="art-editor-screen__element-editor-style-control">
									<input
										type="number"
										class="art-editor-screen__element-editor-style-input"
										id="art-editor-element-margin-top"
										name="art-editor-element-margin-top"
										min="-200"
										max="500"
										step="1"
										inputmode="numeric"
										autocomplete="off"
										aria-label="<?php echo esc_attr__( 'Внешний отступ сверху', 'art-editor' ); ?>"
									/>
									<button
										type="button"
										class="art-editor-screen__element-editor-style-reset"
										id="art-editor-element-margin-top-reset"
										disabled
									>
										<?php echo esc_html__( 'Сбросить', 'art-editor' ); ?>
									</button>
								</div>
							</div>
							<div class="art-editor-screen__element-editor-style-row" id="art-editor-element-margin-bottom-row" hidden>
								<label class="art-editor-screen__element-editor-field-label" for="art-editor-element-margin-bottom">
									<?php echo esc_html__( 'Отступ снизу', 'art-editor' ); ?>
								</label>
								<div class="art-editor-screen__element-editor-style-control">
									<input
										type="number"
										class="art-editor-screen__element-editor-style-input"
										id="art-editor-element-margin-bottom"
										name="art-editor-element-margin-bottom"
										min="-200"
										max="500"
										step="1"
										inputmode="numeric"
										autocomplete="off"
										aria-label="<?php echo esc_attr__( 'Внешний отступ снизу', 'art-editor' ); ?>"
									/>
									<button
										type="button"
										class="art-editor-screen__element-editor-style-reset"
										id="art-editor-element-margin-bottom-reset"
										disabled
									>
										<?php echo esc_html__( 'Сбросить', 'art-editor' ); ?>
									</button>
								</div>
							</div>
						</div>
					</div>
					<div class="art-editor-screen__element-editor-image" id="art-editor-element-image-controls" hidden>
						<button
							type="button"
							class="art-editor-screen__element-editor-image-button"
							id="art-editor-element-image-picker"
						>
							<?php echo esc_html__( 'Выбрать изображение', 'art-editor' ); ?>
						</button>
					</div>
					<div class="art-editor-screen__element-editor-controls" id="art-editor-element-controls" hidden>
						<hr class="art-editor-screen__element-editor-controls-divider" id="art-editor-element-link-divider" hidden />
						<div class="art-editor-screen__element-editor-field">
							<div class="art-editor-screen__element-editor-field-label" id="art-editor-element-link-label">
								<?php echo esc_html__( 'Ссылка', 'art-editor' ); ?>
							</div>
							<div class="art-editor-screen__element-editor-link-row">
								<input
									type="text"
									class="art-editor-screen__element-editor-link-input"
									id="art-editor-element-link-url"
									name="art-editor-element-link-url"
									value=""
									inputmode="url"
									autocomplete="off"
									aria-labelledby="art-editor-element-link-label"
									placeholder="<?php echo esc_attr__( 'Введите или вставьте свой URL-адрес', 'art-editor' ); ?>"
								/>
								<button
									type="button"
									class="art-editor-screen__element-editor-link-settings"
									id="art-editor-element-link-settings"
									aria-expanded="false"
									aria-controls="art-editor-element-link-options"
									aria-label="<?php echo esc_attr__( 'Дополнительные настройки ссылки', 'art-editor' ); ?>"
									title="<?php echo esc_attr__( 'Дополнительные настройки ссылки', 'art-editor' ); ?>"
								>
									<svg class="art-editor-screen__element-editor-link-settings-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
										<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="2"></path>
										<path d="M19.4 15a7.97 7.97 0 0 0 .1-1 7.97 7.97 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8.1 8.1 0 0 0-1.7-1L15 2h-6l-.3 3a8.1 8.1 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.97 7.97 0 0 0-.1 1c0 .34.03.67.1 1l-2 1.5 2 3.5 2.4-1c.52.43 1.1.78 1.7 1L9 22h6l.3-3c.6-.22 1.18-.57 1.7-1l2.4 1 2-3.5-2-1.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
									</svg>
								</button>
							</div>
							<div class="art-editor-screen__element-editor-link-options" id="art-editor-element-link-options">
								<div class="art-editor-screen__element-editor-link-options-inner">
									<label class="art-editor-screen__element-editor-checkbox" for="art-editor-element-link-blank">
										<input
											type="checkbox"
											class="art-editor-screen__element-editor-checkbox-input"
											id="art-editor-element-link-blank"
											name="art-editor-element-link-blank"
											value="1"
										/>
										<span class="art-editor-screen__element-editor-checkbox-label">
											<?php echo esc_html__( 'Открывать в новом окне', 'art-editor' ); ?>
										</span>
									</label>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</aside>
		<section class="art-editor-screen__canvas" id="art-editor-canvas">
			<div class="art-editor-screen__canvas-toolbar">
				<div class="art-editor-screen__canvas-tabs" role="tablist" aria-label="<?php echo esc_attr__( 'Режим центральной области', 'art-editor' ); ?>">
					<button
						type="button"
						class="art-editor-screen__canvas-tab is-active"
						id="art-editor-tab-code"
						role="tab"
						aria-selected="true"
						aria-controls="art-editor-panel-code"
						data-tab="code"
					>
						<?php echo esc_html__( 'Код', 'art-editor' ); ?>
					</button>
					<button
						type="button"
						class="art-editor-screen__canvas-tab"
						id="art-editor-tab-edit"
						role="tab"
						aria-selected="false"
						aria-controls="art-editor-panel-edit"
						data-tab="edit"
					>
						<?php echo esc_html__( 'Редактирование', 'art-editor' ); ?>
					</button>
					<button
						type="button"
						class="art-editor-screen__canvas-tab"
						id="art-editor-tab-view"
						role="tab"
						aria-selected="false"
						aria-controls="art-editor-panel-view"
						data-tab="view"
					>
						<?php echo esc_html__( 'Просмотр', 'art-editor' ); ?>
					</button>
				</div>
				<div class="art-editor-screen__device-toggle" id="art-editor-device-toggle" hidden>
					<span class="screen-reader-text"><?php echo esc_html__( 'Режим предпросмотра', 'art-editor' ); ?></span>
					<button
						type="button"
						class="art-editor-screen__device-button is-active"
						id="art-editor-device-desktop"
						data-device="desktop"
						aria-label="<?php echo esc_attr__( 'Просмотр для компьютера', 'art-editor' ); ?>"
						title="<?php echo esc_attr__( 'Компьютер', 'art-editor' ); ?>"
					>
						<svg class="art-editor-screen__device-button-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
							<rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" stroke-width="2"></rect>
							<path d="M8 20h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
						</svg>
					</button>
					<button
						type="button"
						class="art-editor-screen__device-button"
						id="art-editor-device-mobile"
						data-device="mobile"
						aria-label="<?php echo esc_attr__( 'Просмотр для телефона', 'art-editor' ); ?>"
						title="<?php echo esc_attr__( 'Телефон', 'art-editor' ); ?>"
					>
						<svg class="art-editor-screen__device-button-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
							<rect x="7" y="2.5" width="10" height="19" rx="2" stroke="currentColor" stroke-width="2"></rect>
							<path d="M11 18.5h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
						</svg>
					</button>
				</div>
			</div>
			<div class="art-editor-screen__canvas-panels">
				<div
					class="art-editor-screen__canvas-panel"
					id="art-editor-panel-anchor"
					role="tabpanel"
					aria-labelledby="art-editor-tab-code"
					hidden
				>
					<div class="art-editor-screen__anchor-panel">
						<label class="art-editor-screen__anchor-label" for="art-editor-anchor-id">
							<?php echo esc_html__( 'Добавьте якорную ссылку', 'art-editor' ); ?>
						</label>
						<div class="art-editor-screen__anchor-input-row">
							<span class="art-editor-screen__anchor-prefix" aria-hidden="true">#</span>
							<input
								type="text"
								class="art-editor-screen__anchor-input"
								id="art-editor-anchor-id"
								name="art-editor-anchor-id"
								value=""
								autocomplete="off"
								spellcheck="false"
								placeholder="<?php echo esc_attr__( 'pricing', 'art-editor' ); ?>"
								aria-describedby="art-editor-anchor-hint"
							/>
						</div>
						<p class="art-editor-screen__anchor-hint" id="art-editor-anchor-hint">
							<?php echo esc_html__( 'Используйте короткое латинское имя: буквы, цифры и дефис. В ссылках на лендинге указывайте #имя, например #pricing.', 'art-editor' ); ?>
						</p>
					</div>
				</div>
				<div
					class="art-editor-screen__canvas-panel is-active"
					id="art-editor-panel-code"
					role="tabpanel"
					aria-labelledby="art-editor-tab-code"
				>
					<div class="art-editor-screen__code-panel">
						<label class="screen-reader-text" for="art-editor-code-input">
							<?php echo esc_html__( 'HTML-код', 'art-editor' ); ?>
						</label>
						<textarea
							id="art-editor-code-input"
							class="art-editor-screen__code-input"
							placeholder="<?php echo esc_attr__( 'Введите HTML-код…', 'art-editor' ); ?>"
							spellcheck="false"
						></textarea>
					</div>
				</div>
				<div
					class="art-editor-screen__canvas-panel"
					id="art-editor-panel-edit"
					role="tabpanel"
					aria-labelledby="art-editor-tab-edit"
					hidden
				>
					<div class="art-editor-screen__device-stage">
						<div class="art-editor-screen__device-frame">
							<iframe
								id="art-editor-preview-frame"
								class="art-editor-screen__preview-frame"
								title="<?php echo esc_attr__( 'Визуальное редактирование HTML', 'art-editor' ); ?>"
							></iframe>
						</div>
					</div>
				</div>
				<div
					class="art-editor-screen__canvas-panel"
					id="art-editor-panel-view"
					role="tabpanel"
					aria-labelledby="art-editor-tab-view"
					hidden
				>
					<div class="art-editor-screen__device-stage">
						<div class="art-editor-screen__device-frame">
							<iframe
								id="art-editor-page-preview-frame"
								class="art-editor-screen__preview-frame"
								title="<?php echo esc_attr__( 'Просмотр всех HTML-блоков', 'art-editor' ); ?>"
							></iframe>
						</div>
					</div>
				</div>
			</div>
		</section>
	</main>
	<?php
	$art_editor_editor_scripts = array(
		'jquery',
		'art-editor-screen',
	);

	if ( wp_script_is( 'code-editor', 'enqueued' ) ) {
		$art_editor_editor_scripts = array(
			'jquery',
			'underscore',
			'wp-codemirror',
			'code-editor',
			'art-editor-screen',
		);
	}

	wp_print_scripts( $art_editor_editor_scripts );
	wp_print_footer_scripts();

	if ( function_exists( 'wp_print_media_templates' ) ) {
		wp_print_media_templates();
	}
	?>
</body>
</html>
