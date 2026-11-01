<?php
/**
 * Site chrome hub (header / footer).
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * @var array  $settings
 * @var string $header_url
 * @var string $footer_url
 * @var bool   $show_notice
 */

?>
<div class="wrap art-editor-admin">
	<h1><?php echo esc_html__( 'Шапка и подвал', 'art-editor' ); ?></h1>

	<?php if ( ! empty( $show_notice ) ) : ?>
		<div class="notice notice-success is-dismissible">
			<p><?php echo esc_html__( 'Настройки сохранены.', 'art-editor' ); ?></p>
		</div>
	<?php endif; ?>

	<p class="art-editor-site-chrome-intro">
		<?php echo esc_html__( 'Общая шапка и подвал сайта для темы (ART Theme). На canvas-лендингах Editor они не подставляются — это решает тема.', 'art-editor' ); ?>
	</p>

	<form method="post" action="" class="art-editor-site-chrome-form">
		<?php wp_nonce_field( Art_Editor_Admin_Site_Chrome::NONCE_ACTION ); ?>

		<div class="art-editor-site-chrome-grid">
			<div class="art-editor-panel art-editor-site-chrome-card">
				<h2 class="art-editor-panel__title"><?php echo esc_html__( 'Шапка', 'art-editor' ); ?></h2>
				<p><?php echo esc_html__( 'HTML шапки сайта. Редактируется в АРТ Редакторе.', 'art-editor' ); ?></p>

				<label class="art-editor-settings-checklist__label" for="art-editor-header-enabled">
					<input
						type="checkbox"
						class="art-editor-settings-checklist__input"
						id="art-editor-header-enabled"
						name="art_editor_header_enabled"
						value="1"
						<?php checked( ! empty( $settings['header_enabled'] ) ); ?>
					/>
					<span><?php echo esc_html__( 'Показывать на сайте', 'art-editor' ); ?></span>
				</label>

				<p class="art-editor-site-chrome-card__actions">
					<a class="button button-secondary" href="<?php echo esc_url( $header_url ); ?>">
						<?php echo esc_html__( 'Редактировать', 'art-editor' ); ?>
					</a>
				</p>
			</div>

			<div class="art-editor-panel art-editor-site-chrome-card">
				<h2 class="art-editor-panel__title"><?php echo esc_html__( 'Подвал', 'art-editor' ); ?></h2>
				<p><?php echo esc_html__( 'HTML подвала сайта. Редактируется в АРТ Редакторе.', 'art-editor' ); ?></p>

				<label class="art-editor-settings-checklist__label" for="art-editor-footer-enabled">
					<input
						type="checkbox"
						class="art-editor-settings-checklist__input"
						id="art-editor-footer-enabled"
						name="art_editor_footer_enabled"
						value="1"
						<?php checked( ! empty( $settings['footer_enabled'] ) ); ?>
					/>
					<span><?php echo esc_html__( 'Показывать на сайте', 'art-editor' ); ?></span>
				</label>

				<p class="art-editor-site-chrome-card__actions">
					<a class="button button-secondary" href="<?php echo esc_url( $footer_url ); ?>">
						<?php echo esc_html__( 'Редактировать', 'art-editor' ); ?>
					</a>
				</p>
			</div>
		</div>

		<p class="art-editor-site-chrome-submit">
			<button type="submit" class="button button-primary" name="art_editor_site_chrome_save" value="1">
				<?php echo esc_html__( 'Сохранить', 'art-editor' ); ?>
			</button>
		</p>
	</form>
</div>
