<?php
/**
 * Post content helpers for core/html blocks.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Content
 */
class Art_Editor_Content {

	/**
	 * Extract core/html blocks from post content.
	 *
	 * @param WP_Post $post Post object.
	 * @return array
	 */
	public static function get_html_blocks_from_post( WP_Post $post ) {
		$parsed = parse_blocks( $post->post_content );
		$items  = array();
		$index  = 0;

		foreach ( $parsed as $block ) {
			if ( empty( $block['blockName'] ) || 'core/html' !== $block['blockName'] ) {
				continue;
			}

			$content = self::get_html_block_content( $block );

			$custom_title = self::get_custom_block_title( $block );

			$items[] = array(
				'id'          => 'html-' . $index,
				'title'       => '' !== $custom_title ? $custom_title : self::get_block_title( $content, $index ),
				'titleLocked' => '' !== $custom_title,
				'content'     => $content,
			);

			++$index;
		}

		return $items;
	}

	/**
	 * Read HTML content from a parsed block.
	 *
	 * @param array $block Parsed block.
	 * @return string
	 */
	public static function get_html_block_content( $block ) {
		if ( ! empty( $block['attrs']['content'] ) && is_string( $block['attrs']['content'] ) ) {
			return $block['attrs']['content'];
		}

		if ( ! empty( $block['innerHTML'] ) && is_string( $block['innerHTML'] ) ) {
			return $block['innerHTML'];
		}

		return '';
	}

	/**
	 * Read a custom sidebar title from block attributes.
	 *
	 * @param array $block Parsed block.
	 * @return string
	 */
	public static function get_custom_block_title( $block ) {
		if ( empty( $block['attrs']['artEditorTitle'] ) || ! is_string( $block['attrs']['artEditorTitle'] ) ) {
			return '';
		}

		return trim( $block['attrs']['artEditorTitle'] );
	}

	/**
	 * Build a sidebar title for an HTML block.
	 *
	 * @param string $html  Block HTML.
	 * @param int    $index Block index.
	 * @return string
	 */
	public static function get_block_title( $html, $index ) {
		$html = trim( (string) $html );

		if ( '' === $html ) {
			return sprintf(
				/* translators: %d: block number */
				__( 'Пустой HTML-блок %d', 'art-editor' ),
				$index + 1
			);
		}

		if ( preg_match( '/<h[1-3][^>]*>(.*?)<\/h[1-3]>/is', $html, $matches ) ) {
			$title = wp_strip_all_tags( $matches[1] );
			$title = trim( preg_replace( '/\s+/u', ' ', $title ) );

			if ( '' !== $title ) {
				return $title;
			}
		}

		return sprintf(
			/* translators: %d: block number */
			__( 'HTML-блок %d', 'art-editor' ),
			$index + 1
		);
	}

	/**
	 * Merge HTML blocks back into post content and update the post.
	 *
	 * @param int    $post_id Post ID.
	 * @param array  $blocks  Block payload from the editor.
	 * @param string $status  Optional post status.
	 * @return true|WP_Error
	 */
	public static function save_html_blocks( $post_id, $blocks, $status = '' ) {
		$post = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'art_editor_post_not_found', __( 'Запись не найдена.', 'art-editor' ), array( 'status' => 404 ) );
		}

		if ( ! Art_Editor_Block_Editor::is_supported_post( $post_id ) ) {
			return new WP_Error( 'art_editor_unsupported_post', __( 'Этот тип записи не поддерживается.', 'art-editor' ), array( 'status' => 400 ) );
		}

		$sanitized_blocks = self::sanitize_blocks_payload( $blocks );
		$new_content      = self::merge_html_blocks_into_content( $post->post_content, $sanitized_blocks );
		$update_args      = array(
			'ID'           => $post_id,
			'post_content' => $new_content,
		);

		if ( $status ) {
			$update_args['post_status'] = sanitize_key( $status );
		}

		$result = wp_update_post( wp_slash( $update_args ), true );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return true;
	}

	/**
	 * Sanitize blocks payload from REST/JS.
	 *
	 * @param array $blocks Raw blocks.
	 * @return array
	 */
	public static function sanitize_blocks_payload( $blocks ) {
		if ( ! is_array( $blocks ) ) {
			return array();
		}

		$sanitized = array();

		foreach ( $blocks as $block ) {
			if ( ! is_array( $block ) ) {
				continue;
			}

			$content = isset( $block['content'] ) ? (string) $block['content'] : '';
			$title   = isset( $block['title'] ) ? sanitize_text_field( $block['title'] ) : '';

			if ( ! current_user_can( 'unfiltered_html' ) ) {
				$content = wp_kses_post( $content );
			}

			$sanitized[] = array(
				'content' => $content,
				'title'   => $title,
			);
		}

		return $sanitized;
	}

	/**
	 * Replace core/html blocks in content while preserving other blocks.
	 *
	 * @param string $content Existing post content.
	 * @param array  $blocks  Sanitized HTML blocks.
	 * @return string
	 */
	public static function merge_html_blocks_into_content( $content, $blocks ) {
		$parsed     = parse_blocks( (string) $content );
		$new_blocks = array();
		$index      = 0;
		$count      = count( $blocks );

		foreach ( $parsed as $block ) {
			if ( ! empty( $block['blockName'] ) && 'core/html' === $block['blockName'] ) {
				if ( $index < $count ) {
					$new_blocks[] = self::make_html_block( $blocks[ $index ]['content'], $blocks[ $index ]['title'] );
					++$index;
				}
				continue;
			}

			if ( empty( $block['blockName'] ) && empty( $block['innerHTML'] ) ) {
				continue;
			}

			$new_blocks[] = $block;
		}

		while ( $index < $count ) {
			$new_blocks[] = self::make_html_block( $blocks[ $index ]['content'], $blocks[ $index ]['title'] );
			++$index;
		}

		return serialize_blocks( $new_blocks );
	}

	/**
	 * Build a parsed core/html block array.
	 *
	 * @param string $content HTML content.
	 * @param string $title   Optional custom sidebar title.
	 * @return array
	 */
	public static function make_html_block( $content, $title = '' ) {
		$content = (string) $content;
		$title   = trim( (string) $title );
		$attrs   = array();

		if ( '' !== $title ) {
			$attrs['artEditorTitle'] = $title;
		}

		return array(
			'blockName'    => 'core/html',
			'attrs'        => $attrs,
			'innerBlocks'  => array(),
			'innerHTML'    => $content,
			'innerContent' => array( $content ),
		);
	}
}
