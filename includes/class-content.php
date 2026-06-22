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
			$block_type   = self::get_block_type_from_block( $block );
			$anchor_id    = self::get_anchor_id_from_block( $block, $content );

			$item = array(
				'id'          => ( 'anchor' === $block_type ? 'anchor-' : 'html-' ) . $index,
				'type'        => $block_type,
				'title'       => '' !== $custom_title ? $custom_title : self::get_block_title( $content, $index, $block_type, $anchor_id ),
				'titleLocked' => '' !== $custom_title || 'anchor' === $block_type,
				'content'     => $content,
			);

			if ( 'anchor' === $block_type ) {
				$item['anchorId'] = $anchor_id;
			}

			$items[] = $item;

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
	public static function get_block_title( $html, $index, $type = 'html', $anchor_id = '' ) {
		if ( 'anchor' === $type ) {
			if ( '' !== $anchor_id ) {
				return sprintf(
					/* translators: %s: anchor id */
					__( 'Якорь: %s', 'art-editor' ),
					$anchor_id
				);
			}

			return __( 'Пустой якорь', 'art-editor' );
		}

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

			$type    = isset( $block['type'] ) ? sanitize_key( $block['type'] ) : 'html';
			$content = isset( $block['content'] ) ? (string) $block['content'] : '';
			$title   = isset( $block['title'] ) ? sanitize_text_field( $block['title'] ) : '';
			$anchor_id = '';

			if ( 'anchor' === $type ) {
				$anchor_id = isset( $block['anchorId'] ) ? self::sanitize_anchor_id( $block['anchorId'] ) : self::parse_anchor_id_from_content( $content );
				$content   = self::build_anchor_block_content( $anchor_id );
				$title     = self::get_block_title( $content, 0, 'anchor', $anchor_id );
			} else {
				$type = 'html';

				if ( ! current_user_can( 'unfiltered_html' ) ) {
					$content = wp_kses_post( $content );
				}
			}

			$entry = array(
				'content' => $content,
				'title'   => $title,
				'type'    => $type,
			);

			if ( 'anchor' === $type ) {
				$entry['anchorId'] = $anchor_id;
			}

			$sanitized[] = $entry;
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
					$new_blocks[] = self::make_html_block(
						$blocks[ $index ]['content'],
						$blocks[ $index ]['title'],
						$blocks[ $index ]['type'],
						isset( $blocks[ $index ]['anchorId'] ) ? $blocks[ $index ]['anchorId'] : ''
					);
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
			$new_blocks[] = self::make_html_block(
				$blocks[ $index ]['content'],
				$blocks[ $index ]['title'],
				$blocks[ $index ]['type'],
				isset( $blocks[ $index ]['anchorId'] ) ? $blocks[ $index ]['anchorId'] : ''
			);
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
	public static function make_html_block( $content, $title = '', $type = 'html', $anchor_id = '' ) {
		$content   = (string) $content;
		$title     = trim( (string) $title );
		$type      = sanitize_key( (string) $type );
		$anchor_id = self::sanitize_anchor_id( $anchor_id );
		$attrs     = array();

		if ( '' !== $title ) {
			$attrs['artEditorTitle'] = $title;
		}

		if ( 'anchor' === $type ) {
			$attrs['artEditorBlockType'] = 'anchor';

			if ( '' !== $anchor_id ) {
				$attrs['artEditorAnchorId'] = $anchor_id;
			}

			$content = self::build_anchor_block_content( $anchor_id );
		}

		return array(
			'blockName'    => 'core/html',
			'attrs'        => $attrs,
			'innerBlocks'  => array(),
			'innerHTML'    => $content,
			'innerContent' => array( $content ),
		);
	}

	/**
	 * Read block type from parsed block attributes.
	 *
	 * @param array $block Parsed block.
	 * @return string
	 */
	public static function get_block_type_from_block( $block ) {
		if ( empty( $block['attrs']['artEditorBlockType'] ) || ! is_string( $block['attrs']['artEditorBlockType'] ) ) {
			return 'html';
		}

		$type = sanitize_key( $block['attrs']['artEditorBlockType'] );

		return 'anchor' === $type ? 'anchor' : 'html';
	}

	/**
	 * Read anchor id from block attributes or HTML.
	 *
	 * @param array  $block   Parsed block.
	 * @param string $content Block HTML.
	 * @return string
	 */
	public static function get_anchor_id_from_block( $block, $content ) {
		if ( ! empty( $block['attrs']['artEditorAnchorId'] ) && is_string( $block['attrs']['artEditorAnchorId'] ) ) {
			return self::sanitize_anchor_id( $block['attrs']['artEditorAnchorId'] );
		}

		return self::parse_anchor_id_from_content( $content );
	}

	/**
	 * Sanitize an anchor id.
	 *
	 * @param string $anchor_id Raw anchor id.
	 * @return string
	 */
	public static function sanitize_anchor_id( $anchor_id ) {
		$anchor_id = strtolower( sanitize_title( (string) $anchor_id ) );

		return preg_replace( '/[^a-z0-9\-_]/', '', $anchor_id );
	}

	/**
	 * Parse anchor id from stored HTML.
	 *
	 * @param string $html Block HTML.
	 * @return string
	 */
	public static function parse_anchor_id_from_content( $html ) {
		$html = trim( (string) $html );

		if ( '' === $html ) {
			return '';
		}

		if ( preg_match( '/<div\b[^>]*\bclass="[^"]*\bart-editor-anchor\b[^"]*"[^>]*\bid="([^"]+)"/i', $html, $matches ) ) {
			return self::sanitize_anchor_id( $matches[1] );
		}

		if ( preg_match( '/<div\b[^>]*\bid="([^"]+)"[^>]*\bclass="[^"]*\bart-editor-anchor\b/i', $html, $matches ) ) {
			return self::sanitize_anchor_id( $matches[1] );
		}

		return '';
	}

	/**
	 * Build anchor block HTML.
	 *
	 * @param string $anchor_id Anchor id.
	 * @return string
	 */
	public static function build_anchor_block_content( $anchor_id ) {
		$anchor_id = self::sanitize_anchor_id( $anchor_id );

		if ( '' === $anchor_id ) {
			return '';
		}

		return sprintf(
			'<div id="%s" class="art-editor-anchor" aria-hidden="true"></div>',
			esc_attr( $anchor_id )
		);
	}
}
