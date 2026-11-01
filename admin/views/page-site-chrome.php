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
<div class="wrap art-editor-admin art-editor-site-chrome">
	<h1><?php echo esc_html__( 'Шапка и подвал', 'art-editor' ); ?></h1>

	<?php if ( ! empty( $show_notice ) ) : ?>
		<div class="notice notice-success is-dismissible">
			<p><?php echo esc_html__( 'Настройки сохранены.', 'art-editor' ); ?></p>
		</div>
	<?php endif; ?>

	<p class="art-editor-site-chrome-intro">
		<?php echo esc_html__( 'Общая шапка и подвал сайта. Тема (ART Theme) подставляет их при «Наследовать тему». На canvas без chrome — нет. Режим «Editor: шапка + подвал» показывает их на лендинге без оболочки темы.', 'art-editor' ); ?>
	</p>

	<form method="post" action="" class="art-editor-site-chrome-form">
		<?php wp_nonce_field( Art_Editor_Admin_Site_Chrome::NONCE_ACTION ); ?>

		<div class="art-editor-site-chrome-grid">
			<article class="art-editor-site-chrome-card">
				<div class="art-editor-site-chrome-card__head">
					<span class="art-editor-site-chrome-card__badge"><?php echo esc_html__( 'Зона сайта', 'art-editor' ); ?></span>
					<h2 class="art-editor-site-chrome-card__title"><?php echo esc_html__( 'Шапка', 'art-editor' ); ?></h2>
					<p class="art-editor-site-chrome-card__text">
						<?php echo esc_html__( 'HTML шапки сайта. Редактируется в АРТ Редакторе.', 'art-editor' ); ?>
					</p>
				</div>

				<label class="art-editor-site-chrome-switch" for="art-editor-header-enabled">
					<input
						type="checkbox"
						class="art-editor-site-chrome-switch__input"
						id="art-editor-header-enabled"
						name="art_editor_header_enabled"
						value="1"
						<?php checked( ! empty( $settings['header_enabled'] ) ); ?>
					/>
					<span class="art-editor-site-chrome-switch__control" aria-hidden="true"></span>
					<span class="art-editor-site-chrome-switch__copy">
						<span class="art-editor-site-chrome-switch__label"><?php echo esc_html__( 'Показывать на сайте', 'art-editor' ); ?></span>
						<span class="art-editor-site-chrome-switch__state art-editor-site-chrome-switch__state--off"><?php echo esc_html__( 'Выключено', 'art-editor' ); ?></span>
						<span class="art-editor-site-chrome-switch__state art-editor-site-chrome-switch__state--on"><?php echo esc_html__( 'Включено', 'art-editor' ); ?></span>
					</span>
				</label>

				<div class="art-editor-site-chrome-card__actions">
					<a class="art-editor-site-chrome-card__edit" href="<?php echo esc_url( $header_url ); ?>">
						<?php echo esc_html__( 'Редактировать', 'art-editor' ); ?>
					</a>
				</div>
			</article>

			<article class="art-editor-site-chrome-card">
				<div class="art-editor-site-chrome-card__head">
					<span class="art-editor-site-chrome-card__badge"><?php echo esc_html__( 'Зона сайта', 'art-editor' ); ?></span>
					<h2 class="art-editor-site-chrome-card__title"><?php echo esc_html__( 'Подвал', 'art-editor' ); ?></h2>
					<p class="art-editor-site-chrome-card__text">
						<?php echo esc_html__( 'HTML подвала сайта. Редактируется в АРТ Редакторе.', 'art-editor' ); ?>
					</p>
				</div>

				<label class="art-editor-site-chrome-switch" for="art-editor-footer-enabled">
					<input
						type="checkbox"
						class="art-editor-site-chrome-switch__input"
						id="art-editor-footer-enabled"
						name="art_editor_footer_enabled"
						value="1"
						<?php checked( ! empty( $settings['footer_enabled'] ) ); ?>
					/>
					<span class="art-editor-site-chrome-switch__control" aria-hidden="true"></span>
					<span class="art-editor-site-chrome-switch__copy">
						<span class="art-editor-site-chrome-switch__label"><?php echo esc_html__( 'Показывать на сайте', 'art-editor' ); ?></span>
						<span class="art-editor-site-chrome-switch__state art-editor-site-chrome-switch__state--off"><?php echo esc_html__( 'Выключено', 'art-editor' ); ?></span>
						<span class="art-editor-site-chrome-switch__state art-editor-site-chrome-switch__state--on"><?php echo esc_html__( 'Включено', 'art-editor' ); ?></span>
					</span>
				</label>

				<div class="art-editor-site-chrome-card__actions">
					<a class="art-editor-site-chrome-card__edit" href="<?php echo esc_url( $footer_url ); ?>">
						<?php echo esc_html__( 'Редактировать', 'art-editor' ); ?>
					</a>
				</div>
			</article>
		</div>

		<div class="art-editor-site-chrome-submit">
			<button type="submit" class="art-editor-site-chrome-submit__button" name="art_editor_site_chrome_save" value="1">
				<?php echo esc_html__( 'Сохранить', 'art-editor' ); ?>
			</button>
		</div>
	</form>
</div>
