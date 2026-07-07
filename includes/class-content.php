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

	const META_EMBEDDED_BLOCKS = '_art_editor_embedded_blocks';

	const GUTENBERG_IMPORT_START = '<!-- art-editor:gutenberg-start -->';

	const GUTENBERG_IMPORT_END = '<!-- art-editor:gutenberg-end -->';

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

		if ( Art_Editor_Post_Meta::is_built_with_art_editor( $post_id ) ) {
			$new_content = self::serialize_html_block_items( $sanitized_blocks );
		} else {
			$new_content = self::merge_html_blocks_into_content( $post->post_content, $sanitized_blocks );
		}
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
			return '<div class="art-editor-anchor" aria-hidden="true"></div>';
		}

		return sprintf(
			'<div id="%s" class="art-editor-anchor" aria-hidden="true"></div>',
			esc_attr( $anchor_id )
		);
	}

	/**
	 * Import non-core/html Gutenberg blocks into the first HTML block for ART Editor.
	 *
	 * @param int $post_id Post ID.
	 * @return true|WP_Error
	 */
	public static function import_gutenberg_blocks_into_art_editor( $post_id ) {
		$post_id = (int) $post_id;
		$post    = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'art_editor_post_not_found', __( 'Запись не найдена.', 'art-editor' ), array( 'status' => 404 ) );
		}

		$parsed   = parse_blocks( $post->post_content );
		$embedded = self::repair_embedded_blocks_tree( self::collect_non_html_blocks( $parsed ) );

		if ( empty( $embedded ) ) {
			return true;
		}

		$rendered = self::render_blocks_to_html( $embedded );

		if ( '' === trim( $rendered ) ) {
			return true;
		}

		$html_items = self::get_html_blocks_from_post( $post );

		if ( empty( $html_items ) ) {
			$html_items[] = array(
				'id'          => 'html-0',
				'type'        => 'html',
				'title'       => self::get_block_title( '', 0 ),
				'titleLocked' => false,
				'content'     => '',
			);
		}

		$first_content = (string) $html_items[0]['content'];

		if ( false === strpos( $first_content, self::GUTENBERG_IMPORT_START ) ) {
			$import_chunk = self::GUTENBERG_IMPORT_START . "\n" . $rendered . "\n" . self::GUTENBERG_IMPORT_END;
			$first_content = '' !== trim( $first_content )
				? $import_chunk . "\n\n" . $first_content
				: $import_chunk;
		}

		$html_items[0]['content'] = $first_content;

		self::set_embedded_gutenberg_blocks( $post_id, self::normalize_parsed_blocks( $embedded ) );

		$serialized = self::serialize_html_block_items( $html_items );
		$result     = wp_update_post(
			wp_slash(
				array(
					'ID'           => $post_id,
					'post_content' => $serialized,
				)
			),
			true
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return true;
	}

	/**
	 * Restore embedded Gutenberg blocks when leaving ART Editor builder mode.
	 *
	 * @param int $post_id Post ID.
	 * @return true|WP_Error
	 */
	public static function export_art_editor_to_gutenberg( $post_id ) {
		$post_id = (int) $post_id;
		$post    = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'art_editor_post_not_found', __( 'Запись не найдена.', 'art-editor' ), array( 'status' => 404 ) );
		}

		$embedded   = self::get_embedded_gutenberg_blocks( $post_id );
		$embedded   = self::normalize_parsed_blocks( $embedded );
		$html_items = self::get_html_blocks_from_post( $post );
		$blocks     = $embedded;

		if ( ! empty( $html_items ) ) {
			$html_items[0]['content'] = self::strip_gutenberg_import_from_html( (string) $html_items[0]['content'] );
		}

		foreach ( $html_items as $item ) {
			$blocks[] = self::make_html_block(
				(string) $item['content'],
				(string) $item['title'],
				(string) $item['type'],
				isset( $item['anchorId'] ) ? (string) $item['anchorId'] : ''
			);
		}

		if ( empty( $blocks ) ) {
			self::clear_embedded_gutenberg_blocks( $post_id );
			return true;
		}

		$result = wp_update_post(
			wp_slash(
				array(
					'ID'           => $post_id,
					'post_content' => serialize_blocks( $blocks ),
				)
			),
			true
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		self::clear_embedded_gutenberg_blocks( $post_id );

		return true;
	}

	/**
	 * Collect parsed blocks that are not ART Editor HTML blocks.
	 *
	 * @param array<int, array<string, mixed>> $parsed Parsed post content.
	 * @return array<int, array<string, mixed>>
	 */
	public static function collect_non_html_blocks( array $parsed ) {
		$blocks = array();

		foreach ( $parsed as $block ) {
			if ( ! empty( $block['blockName'] ) ) {
				if ( 'core/html' === $block['blockName'] ) {
					continue;
				}

				$blocks[] = $block;
				continue;
			}

			if ( ! empty( $block['innerHTML'] ) && '' !== trim( (string) $block['innerHTML'] ) ) {
				$blocks[] = $block;
			}
		}

		return $blocks;
	}

	/**
	 * Render parsed Gutenberg blocks to HTML for the first HTML block import.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @return string
	 */
	public static function render_blocks_to_html( array $blocks ) {
		$chunks = array();

		foreach ( $blocks as $block ) {
			if ( ! empty( $block['blockName'] ) ) {
				$chunks[] = render_block( $block );
				continue;
			}

			if ( ! empty( $block['innerHTML'] ) ) {
				$chunks[] = (string) $block['innerHTML'];
			}
		}

		return trim( implode( "\n\n", array_filter( $chunks ) ) );
	}

	/**
	 * Remove imported Gutenberg HTML markers from the first HTML block.
	 *
	 * @param string $html HTML block content.
	 * @return string
	 */
	public static function strip_gutenberg_import_from_html( $html ) {
		$html = (string) $html;

		if ( '' === $html || false === strpos( $html, self::GUTENBERG_IMPORT_START ) ) {
			return $html;
		}

		$pattern = '/\s*' . preg_quote( self::GUTENBERG_IMPORT_START, '/' ) . '\s*.*?\s*' . preg_quote( self::GUTENBERG_IMPORT_END, '/' ) . '\s*/is';

		return trim( (string) preg_replace( $pattern, '', $html, 1 ) );
	}

	/**
	 * Serialize sidebar HTML block items to post content with only core/html blocks.
	 *
	 * @param array<int, array<string, mixed>> $items HTML block items.
	 * @return string
	 */
	public static function serialize_html_block_items( array $items ) {
		$blocks = array();

		foreach ( $items as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}

			$blocks[] = self::make_html_block(
				isset( $item['content'] ) ? (string) $item['content'] : '',
				isset( $item['title'] ) ? (string) $item['title'] : '',
				isset( $item['type'] ) ? (string) $item['type'] : 'html',
				isset( $item['anchorId'] ) ? (string) $item['anchorId'] : ''
			);
		}

		return serialize_blocks( $blocks );
	}

	/**
	 * @param int $post_id Post ID.
	 * @return array<int, array<string, mixed>>
	 */
	public static function get_embedded_gutenberg_blocks( $post_id ) {
		$post_id = (int) $post_id;
		$raw     = get_post_meta( $post_id, self::META_EMBEDDED_BLOCKS, true );

		if ( ! is_string( $raw ) || '' === $raw ) {
			return array();
		}

		$blocks = self::decode_embedded_blocks_payload( $raw );

		if ( ! empty( $blocks ) && ! self::is_markup_embedded_payload( $raw ) ) {
			self::set_embedded_gutenberg_blocks( $post_id, $blocks );
		}

		return $blocks;
	}

	/**
	 * @param int                                $post_id Post ID.
	 * @param array<int, array<string, mixed>> $blocks  Parsed Gutenberg blocks.
	 */
	public static function set_embedded_gutenberg_blocks( $post_id, array $blocks ) {
		$post_id = (int) $post_id;

		if ( empty( $blocks ) ) {
			self::clear_embedded_gutenberg_blocks( $post_id );
			return;
		}

		update_post_meta(
			$post_id,
			self::META_EMBEDDED_BLOCKS,
			self::encode_embedded_blocks_payload( $blocks )
		);
	}

	/**
	 * @param int $post_id Post ID.
	 */
	public static function clear_embedded_gutenberg_blocks( $post_id ) {
		delete_post_meta( (int) $post_id, self::META_EMBEDDED_BLOCKS );
	}

	/**
	 * Encode parsed blocks for safe post meta storage.
	 *
	 * Stores canonical Gutenberg block markup (not JSON arrays) wrapped in base64
	 * so innerContent / innerBlocks survive round-trip without validation errors.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed Gutenberg blocks.
	 * @return string
	 */
	private static function encode_embedded_blocks_payload( array $blocks ) {
		$blocks = self::normalize_parsed_blocks( $blocks );

		if ( empty( $blocks ) ) {
			return '';
		}

		return base64_encode( serialize_blocks( $blocks ) );
	}

	/**
	 * Decode embedded blocks payload from post meta.
	 *
	 * @param string $raw Raw meta value.
	 * @return array<int, array<string, mixed>>
	 */
	private static function decode_embedded_blocks_payload( $raw ) {
		$raw = (string) $raw;

		if ( '' === $raw ) {
			return array();
		}

		// Legacy plain JSON array (pre-base64).
		if ( '[' === ltrim( $raw ) ) {
			$decoded = json_decode( $raw, true );

			return is_array( $decoded ) ? self::normalize_parsed_blocks( self::repair_embedded_blocks_tree( $decoded ) ) : array();
		}

		$payload = base64_decode( $raw, true );

		if ( false === $payload || '' === $payload ) {
			return array();
		}

		// Current format: base64-wrapped block markup.
		if ( false !== strpos( $payload, '<!-- wp:' ) ) {
			return self::normalize_parsed_blocks( parse_blocks( $payload ) );
		}

		// Transitional format: base64-wrapped JSON array.
		$decoded = json_decode( $payload, true );

		if ( is_array( $decoded ) ) {
			return self::normalize_parsed_blocks( self::repair_embedded_blocks_tree( $decoded ) );
		}

		return array();
	}

	/**
	 * Detect whether embedded blocks meta stores canonical block markup.
	 *
	 * @param string $raw Raw meta value.
	 * @return bool
	 */
	private static function is_markup_embedded_payload( $raw ) {
		$raw = (string) $raw;

		if ( '[' === ltrim( $raw ) ) {
			return false;
		}

		$payload = base64_decode( $raw, true );

		return false !== $payload && false !== strpos( $payload, '<!-- wp:' );
	}

	/**
	 * Recursively repair strings corrupted by JSON_HEX + wp_unslash in legacy storage.
	 *
	 * @param mixed $value Meta tree node.
	 * @return mixed
	 */
	private static function repair_embedded_blocks_tree( $value ) {
		if ( is_array( $value ) ) {
			$repaired = array();

			foreach ( $value as $key => $item ) {
				$repaired[ $key ] = self::repair_embedded_blocks_tree( $item );
			}

			return $repaired;
		}

		if ( ! is_string( $value ) ) {
			return $value;
		}

		return self::repair_block_string( $value );
	}

	/**
	 * Repair common string corruption in stored block trees.
	 *
	 * @param string $string Raw string.
	 * @return string
	 */
	private static function repair_block_string( $string ) {
		if ( '' === $string ) {
			return $string;
		}

		if ( false !== strpos( $string, 'u00' ) ) {
			$string = self::repair_unicode_escape_string( $string );
		}

		if ( false !== strpos( $string, 'nn' ) ) {
			$string = preg_replace(
				'/(<\/(?:li|p|div|figure|ul|ol|h[1-6]|section|article)>)nn(<(?:li|p|div|figure|ul|ol|h[1-6]|section|article))/i',
				"$1\n\n$2",
				$string
			);
		}

		return $string;
	}

	/**
	 * Restore HTML broken by `\u003C` becoming `u003C` in post meta.
	 *
	 * @param string $string Raw string.
	 * @return string
	 */
	private static function repair_unicode_escape_string( $string ) {
		if ( '' === $string || false === strpos( $string, 'u00' ) ) {
			return $string;
		}

		$string = preg_replace_callback(
			'/nu([0-9a-fA-F]{4})/',
			static function ( $matches ) {
				$char = json_decode( '"\\u' . $matches[1] . '"' );

				return "\n" . ( is_string( $char ) ? $char : '' );
			},
			$string
		);

		$string = preg_replace_callback(
			'/(?<![\\\\])u([0-9a-fA-F]{4})/',
			static function ( $matches ) {
				$char = json_decode( '"\\u' . $matches[1] . '"' );

				return is_string( $char ) ? $char : $matches[0];
			},
			$string
		);

		return preg_replace( '/(<\/[^>]+>)n$/', "$1\n", $string );
	}

	/**
	 * Normalize parsed blocks before serializing back to post content.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @return array<int, array<string, mixed>>
	 */
	private static function normalize_parsed_blocks( array $blocks ) {
		if ( empty( $blocks ) ) {
			return array();
		}

		$blocks     = self::repair_embedded_blocks_tree( $blocks );
		$serialized = serialize_blocks( $blocks );
		$parsed     = parse_blocks( $serialized );
		$normalized = array();

		foreach ( $parsed as $block ) {
			if ( empty( $block['blockName'] ) && empty( $block['innerHTML'] ) ) {
				continue;
			}

			$normalized[] = $block;
		}

		return $normalized;
	}
}
