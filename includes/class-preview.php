<?php
/**
 * Preview document assembly and CSS scoping for HTML blocks.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Preview
 */
class Art_Editor_Preview {

	/**
	 * Current HTML block index while rendering frontend output.
	 *
	 * @var int
	 */
	private static $frontend_block_index = 0;

	/**
	 * Reset the frontend HTML block counter.
	 */
	public static function reset_frontend_block_index() {
		self::$frontend_block_index = 0;
	}

	/**
	 * Parse raw block HTML into body markup and style contents.
	 *
	 * @param string $html Block HTML.
	 * @param int    $depth Recursion guard for nested document shells.
	 * @return array{styles:string[],body:string,links:string[],scripts:string[]}
	 */
	public static function parse_block_parts( $html, $depth = 0 ) {
		$html = self::normalize_block_html( $html );

		list( $html, $scripts ) = self::extract_inline_scripts( $html );

		$styles = array();
		$links  = array();
		$body   = $html;

		if ( '' === trim( $html ) || ! class_exists( 'DOMDocument' ) ) {
			return array(
				'styles'  => $styles,
				'body'    => $body,
				'links'   => $links,
				'scripts' => $scripts,
			);
		}

		$trimmed     = ltrim( $html );
		$is_full_doc = 0 === stripos( $trimmed, '<!doctype' ) || 0 === stripos( $trimmed, '<html' );
		$load_html   = $is_full_doc
			? $html
			: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' . $html . '</body></html>';

		$previous = libxml_use_internal_errors( true );
		$document = new DOMDocument();
		$loaded   = $document->loadHTML(
			$load_html,
			LIBXML_HTML_NODEFDTD | LIBXML_HTML_NODEFDTD
		);

		if ( $loaded ) {
			$link_nodes = $document->getElementsByTagName( 'link' );

			for ( $index = $link_nodes->length - 1; $index >= 0; $index-- ) {
				$link_node = $link_nodes->item( $index );

				if ( ! $link_node instanceof DOMElement ) {
					continue;
				}

				$rel  = strtolower( trim( (string) $link_node->getAttribute( 'rel' ) ) );
				$href = trim( (string) $link_node->getAttribute( 'href' ) );

				if ( 'stylesheet' !== $rel || '' === $href ) {
					continue;
				}

				$links[] = esc_url_raw( $href );
				$link_node->parentNode->removeChild( $link_node );
			}

			$style_nodes = $document->getElementsByTagName( 'style' );

			for ( $index = $style_nodes->length - 1; $index >= 0; $index-- ) {
				$style_node = $style_nodes->item( $index );

				if ( ! $style_node instanceof DOMNode ) {
					continue;
				}

				$styles[] = $style_node->textContent;
				$style_node->parentNode->removeChild( $style_node );
			}

			$body_node = $document->getElementsByTagName( 'body' )->item( 0 );

			if ( $body_node instanceof DOMNode ) {
				$body = '';

				foreach ( $body_node->childNodes as $child ) {
					$body .= $document->saveHTML( $child );
				}
			}
		}

		libxml_clear_errors();
		libxml_use_internal_errors( $previous );

		$body  = trim( (string) $body );
		$links = array_values( array_unique( array_filter( $links ) ) );

		if ( $depth < 1 && '' !== $body && preg_match( '/<html\b/i', $body ) ) {
			$nested = self::parse_block_parts( $body, $depth + 1 );

			return array(
				'styles'  => array_merge( $styles, $nested['styles'] ),
				'body'    => $nested['body'],
				'links'   => array_values( array_unique( array_merge( $links, $nested['links'] ) ) ),
				'scripts' => array_merge( $scripts, $nested['scripts'] ),
			);
		}

		return array(
			'styles'  => $styles,
			'body'    => $body,
			'links'   => $links,
			'scripts' => $scripts,
		);
	}

	/**
	 * Trim and strip a UTF-8 BOM from raw block HTML.
	 *
	 * @param string $html Block HTML.
	 * @return string
	 */
	public static function normalize_block_html( $html ) {
		$html = (string) $html;

		if ( '' === $html ) {
			return '';
		}

		$html = preg_replace( '/^\xEF\xBB\xBF/', '', $html );

		return trim( $html );
	}

	/**
	 * Extract raw <script> tags before DOMDocument so JS is not mangled.
	 *
	 * DOMDocument/libxml treats HTML-looking fragments inside scripts
	 * (e.g. '</td>') as real tags and can encode & as entities — breaking JS.
	 *
	 * @param string $html             Block HTML.
	 * @param bool   $use_placeholders When true, replace scripts with HTML comment tokens.
	 * @return array{0:string,1:string[]} HTML without scripts, list of raw script tags.
	 */
	public static function extract_inline_scripts( $html, $use_placeholders = false ) {
		$html    = (string) $html;
		$scripts = array();

		if ( '' === $html || false === stripos( $html, '<script' ) ) {
			return array( $html, $scripts );
		}

		$replaced = preg_replace_callback(
			'/<script\b[^>]*>[\s\S]*?<\/script>/i',
			static function ( $matches ) use ( &$scripts, $use_placeholders ) {
				$index     = count( $scripts );
				$scripts[] = Art_Editor_Preview::normalize_script_ampersands( $matches[0] );

				if ( $use_placeholders ) {
					return '<!--art-editor-protected-script:' . $index . '-->';
				}

				return '';
			},
			$html
		);

		if ( ! is_string( $replaced ) ) {
			return array( $html, array() );
		}

		return array( $replaced, $scripts );
	}

	/**
	 * Restore HTML entity ampersands that break JavaScript operators.
	 *
	 * WordPress content filters can turn && into &#038;&#038; inside scripts.
	 *
	 * @param string $script Raw script tag markup.
	 * @return string
	 */
	public static function normalize_script_ampersands( $script ) {
		$script = (string) $script;

		if ( '' === $script ) {
			return '';
		}

		return str_replace(
			array( '&#038;', '&#38;', '&amp;' ),
			'&',
			$script
		);
	}

	/**
	 * Restore scripts previously replaced with comment placeholders.
	 *
	 * @param string   $html    HTML with placeholders.
	 * @param string[] $scripts Raw script tags.
	 * @return string
	 */
	public static function restore_inline_scripts( $html, $scripts ) {
		$html    = (string) $html;
		$scripts = is_array( $scripts ) ? $scripts : array();

		if ( empty( $scripts ) ) {
			return $html;
		}

		foreach ( $scripts as $index => $script_tag ) {
			$placeholder = '<!--art-editor-protected-script:' . (int) $index . '-->';
			$html        = str_replace( $placeholder, self::normalize_script_ampersands( $script_tag ), $html );
		}

		return $html;
	}

	/**
	 * Scope one HTML block for safe multi-block rendering.
	 *
	 * @param string $html  Block HTML.
	 * @param int    $index Block index.
	 * @return string
	 */
	public static function scope_block_html( $html, $index ) {
		$index = max( 0, (int) $index );
		$parts = self::parse_block_parts( $html );
		$scope = '.art-editor-html-block[data-art-editor-block="' . $index . '"]';
		$css   = self::build_wrapper_css( $scope );

		foreach ( $parts['styles'] as $style_content ) {
			$scoped = self::scope_stylesheet( $style_content, $scope );

			if ( '' !== $scoped ) {
				$css .= $scoped;
			}
		}

		$body = self::fix_inline_leaking_styles( $parts['body'] );

		$markup = '<div class="art-editor-html-block" data-art-editor-block="' . $index . '">';

		if ( '' !== trim( $css ) ) {
			$markup = '<style>' . $css . '</style>' . $markup;
		}

		$markup .= $body;

		foreach ( (array) $parts['scripts'] as $script_tag ) {
			$markup .= self::normalize_script_ampersands( $script_tag );
		}

		$markup .= '</div>';

		return $markup;
	}

	/**
	 * Build base wrapper CSS for a scoped HTML block.
	 *
	 * @param string $scope Scope selector.
	 * @return string
	 */
	private static function build_wrapper_css( $scope ) {
		return $scope . '{position:relative;isolation:isolate;display:flow-root;}' .
			$scope . ' .art-vsl{isolation:auto;}';
	}

	/**
	 * Rewrite inline styles that leak outside a scoped HTML block.
	 *
	 * @param string $html Block body HTML.
	 * @return string
	 */
	private static function fix_inline_leaking_styles( $html ) {
		$html = (string) $html;

		if ( '' === $html ) {
			return '';
		}

		return (string) preg_replace_callback(
			'/\bstyle=(["\'])(.*?)\1/is',
			static function ( $matches ) {
				$quote = $matches[1];
				$style = preg_replace( '/\bposition\s*:\s*fixed\b/i', 'position:absolute', $matches[2] );

				return 'style=' . $quote . ( is_string( $style ) ? $style : $matches[2] ) . $quote;
			},
			$html
		);
	}

	/**
	 * Collect unique stylesheet links referenced by HTML blocks.
	 *
	 * @param string[] $blocks Block HTML strings.
	 * @return string[]
	 */
	public static function collect_block_stylesheet_links( $blocks ) {
		$links = array();

		if ( ! is_array( $blocks ) ) {
			return $links;
		}

		foreach ( $blocks as $block_html ) {
			$parts = self::parse_block_parts( (string) $block_html );
			$links = array_merge( $links, $parts['links'] );
		}

		return array_values( array_unique( array_filter( $links ) ) );
	}

	/**
	 * Prefix CSS selectors with a scope selector.
	 *
	 * @param string $css             Raw CSS.
	 * @param string $scope_selector  Scope selector.
	 * @return string
	 */
	public static function scope_stylesheet( $css, $scope_selector ) {
		$css = trim( (string) $css );

		if ( '' === $css ) {
			return '';
		}

		$css = self::scope_css_chunk( $css, $scope_selector );

		return self::fix_leaking_declarations( $css );
	}

	/**
	 * Build a preview iframe document from HTML block contents.
	 *
	 * @param string[] $blocks  Block HTML strings.
	 * @param array    $options Preview options.
	 * @return string
	 */
	public static function build_document( $blocks, $options = array() ) {
		$defaults = array(
			'layout_mode'           => Art_Editor_Post_Meta::LAYOUT_CANVAS,
			'style_mode'            => Art_Editor_Post_Meta::STYLE_EDITOR,
			'block_link_navigation' => false,
		);
		$options  = wp_parse_args( $options, $defaults );
		$blocks   = is_array( $blocks ) ? $blocks : array();
		$body     = '';
		$index    = 0;

		foreach ( $blocks as $block_html ) {
			$block_html = do_shortcode( (string) $block_html );
			$body      .= self::scope_block_html( $block_html, $index );
			++$index;
		}

		if ( Art_Editor_Post_Meta::LAYOUT_CANVAS === $options['layout_mode'] ) {
			$body = '<div class="art-editor-canvas"><div class="art-editor-canvas__content">' . $body . '</div></div>';
		}

		return self::wrap_document_body(
			$body,
			array(
				'layout_mode'           => $options['layout_mode'],
				'block_link_navigation' => ! empty( $options['block_link_navigation'] ),
				'stylesheet_links'      => self::collect_block_stylesheet_links( $blocks ),
				'html_blocks'           => $blocks,
			)
		);
	}

	/**
	 * Build a scoped iframe document for the editor "Edit" tab (single block).
	 *
	 * @param string $html    Block HTML.
	 * @param array  $options Preview options.
	 * @return string
	 */
	public static function build_edit_block_document( $html, $options = array() ) {
		$defaults = array(
			'layout_mode' => Art_Editor_Post_Meta::LAYOUT_CANVAS,
			'block_index' => 0,
		);
		$options  = wp_parse_args( $options, $defaults );
		$body     = self::scope_block_html( do_shortcode( (string) $html ), (int) $options['block_index'] );

		if ( Art_Editor_Post_Meta::LAYOUT_CANVAS === $options['layout_mode'] ) {
			$body = '<div class="art-editor-canvas"><div class="art-editor-canvas__content">' . $body . '</div></div>';
		}

		return self::wrap_document_body(
			$body,
			array(
				'layout_mode'           => $options['layout_mode'],
				'block_link_navigation' => true,
				'stylesheet_links'      => self::collect_block_stylesheet_links( array( $html ) ),
				'html_blocks'           => array( $html ),
			)
		);
	}

	/**
	 * Wrap preview body markup in a full HTML document.
	 *
	 * @param string $body    Document body HTML.
	 * @param array  $options Wrapper options.
	 * @return string
	 */
	private static function wrap_document_body( $body, $options = array() ) {
		$defaults = array(
			'layout_mode'           => Art_Editor_Post_Meta::LAYOUT_CANVAS,
			'block_link_navigation' => false,
			'stylesheet_links'      => array(),
			'html_blocks'           => array(),
		);
		$options  = wp_parse_args( $options, $defaults );

		$head_parts   = array();
		$head_parts[] = '<meta charset="utf-8">';
		$head_parts[] = '<meta name="viewport" content="width=device-width, initial-scale=1">';
		$head_parts[] = Art_Editor_Editor_Screen::get_site_icon_head_markup();

		foreach ( (array) $options['stylesheet_links'] as $href ) {
			$href = esc_url( (string) $href );

			if ( '' === $href ) {
				continue;
			}

			$head_parts[] = '<link rel="stylesheet" href="' . $href . '">';
		}

		$partner_assets = apply_filters(
			'art_editor_preview_assets',
			array(
				'styles'        => array(),
				'scripts'       => array(),
				'inline_before' => array(),
			),
			(array) $options['html_blocks'],
			$options
		);

		foreach ( (array) ( $partner_assets['styles'] ?? array() ) as $partner_style ) {
			$partner_style = esc_url( (string) $partner_style );
			if ( '' !== $partner_style ) {
				$head_parts[] = '<link rel="stylesheet" href="' . $partner_style . '">';
			}
		}

		foreach ( (array) ( $partner_assets['inline_before'] ?? array() ) as $inline_script ) {
			$inline_script = (string) $inline_script;
			if ( '' !== trim( $inline_script ) ) {
				$head_parts[] = '<script>' . $inline_script . '</script>';
			}
		}

		$head_parts[] = '<style id="art-editor-preview-base">' . self::get_base_styles() . '</style>';

		if ( Art_Editor_Post_Meta::LAYOUT_CANVAS === $options['layout_mode'] ) {
			$head_parts[] = '<style id="art-editor-preview-canvas">' . self::get_canvas_styles() . '</style>';
		}

		if ( ! empty( $options['block_link_navigation'] ) ) {
			$head_parts[] = self::get_link_guard_script();
		}

		$body_scripts = '';
		foreach ( (array) ( $partner_assets['scripts'] ?? array() ) as $partner_script ) {
			$partner_script = esc_url( (string) $partner_script );
			if ( '' !== $partner_script ) {
				$body_scripts .= '<script src="' . $partner_script . '"></script>';
			}
		}

		return '<!doctype html><html><head>' . implode( '', $head_parts ) . '</head><body>' . $body . $body_scripts . '</body></html>';
	}

	/**
	 * Scope a rendered core/html block on the frontend.
	 *
	 * @param string $block_content Rendered block HTML.
	 * @param array  $block         Parsed block.
	 * @return string
	 */
	public static function maybe_scope_rendered_block( $block_content, $block ) {
		if ( empty( $block['blockName'] ) || 'core/html' !== $block['blockName'] ) {
			return $block_content;
		}

		$post_id = (int) get_the_ID();

		if ( $post_id <= 0 || ! Art_Editor_Post_Meta::should_apply_frontend_settings( $post_id ) ) {
			return $block_content;
		}

		$scoped = self::scope_block_html( $block_content, self::$frontend_block_index );
		++self::$frontend_block_index;

		return $scoped;
	}

	/**
	 * Base preview reset styles shared with the editor iframe.
	 *
	 * @return string
	 */
	private static function get_base_styles() {
		return 'html,body{margin:0;padding:0;box-sizing:border-box;}' .
			'*,*::before,*::after{box-sizing:inherit;}' .
			'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1e1e1e;}' .
			'a:not([style*="text-decoration"]):not(:has([style*="text-decoration"])){text-decoration:none;}' .
			'@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth;}}' .
			'img,video,iframe,svg{max-width:100%;}';
	}

	/**
	 * Canvas layout styles for preview/front parity.
	 *
	 * @return string
	 */
	private static function get_canvas_styles() {
		$path = ART_EDITOR_PLUGIN_DIR . 'assets/css/canvas.css';

		if ( ! file_exists( $path ) ) {
			return '.art-editor-html-block img,.art-editor-html-block video,.art-editor-html-block iframe,.art-editor-html-block svg{max-width:100%;height:auto;}';
		}

		$css = file_get_contents( $path );

		if ( false === $css ) {
			return '';
		}

		return $css;
	}

	/**
	 * Prevent anchor navigation inside preview iframes.
	 *
	 * @return string
	 */
	private static function get_link_guard_script() {
		return '<script id="art-editor-preview-link-guard">(function(){"use strict";function preventAnchorNavigation(event){var node=event.target;while(node&&node!==document.body){if(node.tagName==="A"){event.preventDefault();event.stopPropagation();return;}node=node.parentElement;}}document.addEventListener("mousedown",preventAnchorNavigation,true);document.addEventListener("click",preventAnchorNavigation,true);})();</script>';
	}

	/**
	 * Scope a CSS chunk, preserving unsupported at-rules.
	 *
	 * @param string $css             CSS chunk.
	 * @param string $scope_selector  Scope selector.
	 * @return string
	 */
	private static function scope_css_chunk( $css, $scope_selector ) {
		$output = '';
		$length = strlen( $css );
		$index  = 0;

		while ( $index < $length ) {
			if ( preg_match( '/\G\s+/s', $css, $match, 0, $index ) ) {
				$output .= $match[0];
				$index  += strlen( $match[0] );
				continue;
			}

			if ( self::css_starts_with_comment( $css, $index ) ) {
				$comment_end = self::find_css_comment_end( $css, $index );

				if ( false === $comment_end ) {
					$output .= substr( $css, $index );
					break;
				}

				$output .= substr( $css, $index, $comment_end - $index + 1 );
				$index   = $comment_end + 1;
				continue;
			}

			if ( '@' === $css[ $index ] ) {
				$rule_end = self::find_css_block_end( $css, $index );

				if ( false === $rule_end ) {
					$output .= substr( $css, $index );
					break;
				}

				$at_rule = substr( $css, $index, $rule_end - $index + 1 );
				$output .= self::scope_at_rule( $at_rule, $scope_selector );
				$index   = $rule_end + 1;
				continue;
			}

			$rule_end = self::find_css_block_end( $css, $index );

			if ( false === $rule_end ) {
				$output .= substr( $css, $index );
				break;
			}

			$rule    = substr( $css, $index, $rule_end - $index + 1 );
			$output .= self::scope_css_rule( $rule, $scope_selector );
			$index   = $rule_end + 1;
		}

		return $output;
	}

	/**
	 * Scope or pass through an at-rule.
	 *
	 * @param string $at_rule         Full at-rule block.
	 * @param string $scope_selector  Scope selector.
	 * @return string
	 */
	private static function scope_at_rule( $at_rule, $scope_selector ) {
		if ( preg_match( '/^@(charset|import)\b/i', $at_rule ) ) {
			return $at_rule;
		}

		if ( preg_match( '/^@(-webkit-)?keyframes\b/i', $at_rule ) ) {
			return $at_rule;
		}

		if ( preg_match( '/^@font-face\b/i', $at_rule ) ) {
			return $at_rule;
		}

		$open_brace = strpos( $at_rule, '{' );

		if ( false === $open_brace ) {
			return $at_rule;
		}

		$prefix = substr( $at_rule, 0, $open_brace + 1 );
		$suffix = substr( $at_rule, $open_brace + 1, -1 );

		return $prefix . self::scope_css_chunk( $suffix, $scope_selector ) . '}';
	}

	/**
	 * Scope one CSS rule block.
	 *
	 * @param string $rule            Full CSS rule.
	 * @param string $scope_selector  Scope selector.
	 * @return string
	 */
	private static function scope_css_rule( $rule, $scope_selector ) {
		$open_brace = strpos( $rule, '{' );

		if ( false === $open_brace ) {
			return $rule;
		}

		$selectors = trim( substr( $rule, 0, $open_brace ) );
		$body      = substr( $rule, $open_brace );

		if ( '' === $selectors ) {
			return $rule;
		}

		if ( self::rule_targets_document_shell( $selectors ) ) {
			$body = self::strip_document_shell_sizing( $body );

			if ( '' === trim( $body, " \t\n\r\0\x0B{}" ) ) {
				return '';
			}
		}

		return self::prefix_selectors( $selectors, $scope_selector ) . $body;
	}

	/**
	 * Whether a CSS rule selector list targets only document shell roots.
	 *
	 * @param string $selectors Selector list.
	 * @return bool
	 */
	private static function rule_targets_document_shell( $selectors ) {
		$parts = array_filter( array_map( 'trim', explode( ',', (string) $selectors ) ) );

		if ( empty( $parts ) ) {
			return false;
		}

		foreach ( $parts as $selector ) {
			if ( ! preg_match( '/^(html|body|:root)$/i', $selector ) ) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Remove viewport document sizing from html/body/:root rules before scoping.
	 *
	 * @param string $rule_body CSS declarations block including braces.
	 * @return string
	 */
	private static function strip_document_shell_sizing( $rule_body ) {
		$rule_body = (string) $rule_body;

		if ( '' === $rule_body || '{' !== $rule_body[0] ) {
			return $rule_body;
		}

		$declarations = substr( $rule_body, 1, -1 );
		$declarations = preg_replace( '/\bmin-height\s*:\s*100(?:vh|dvh|svh|%)\s*;?/i', '', $declarations );
		$declarations = preg_replace( '/\bheight\s*:\s*100(?:vh|dvh|svh|%)\s*;?/i', '', $declarations );

		if ( ! is_string( $declarations ) ) {
			return $rule_body;
		}

		return '{' . trim( $declarations, " \t\n\r\0\x0B;" ) . '}';
	}

	/**
	 * Prefix a selector list with the scope selector.
	 *
	 * @param string $selectors       Selector list.
	 * @param string $scope_selector  Scope selector.
	 * @return string
	 */
	private static function prefix_selectors( $selectors, $scope_selector ) {
		$parts  = explode( ',', $selectors );
		$scoped = array();

		foreach ( $parts as $selector ) {
			$selector = trim( $selector );

			if ( '' === $selector ) {
				continue;
			}

			if ( preg_match( '/^(html|body|:root)$/i', $selector ) ) {
				$scoped[] = $scope_selector;
				continue;
			}

			if ( preg_match( '/^(html|body|:root)\s+/i', $selector ) ) {
				$scoped[] = preg_replace( '/^(html|body|:root)\s+/i', $scope_selector . ' ', $selector );
				continue;
			}

			$scoped[] = $scope_selector . ' ' . $selector;
		}

		return implode( ', ', $scoped );
	}

	/**
	 * Find the closing brace for a CSS block starting at an offset.
	 *
	 * @param string $css    CSS string.
	 * @param int    $start  Start offset.
	 * @return int|false
	 */
	private static function find_css_block_end( $css, $start ) {
		$length = strlen( $css );
		$depth  = 0;
		$index  = $start;

		for ( ; $index < $length; $index++ ) {
			$char = $css[ $index ];

			if ( self::css_starts_with_comment( $css, $index ) ) {
				$comment_end = self::find_css_comment_end( $css, $index );

				if ( false === $comment_end ) {
					return false;
				}

				$index = $comment_end;
				continue;
			}

			if ( "'" === $char || '"' === $char ) {
				$string_end = self::skip_css_string( $css, $index );

				if ( false === $string_end ) {
					return false;
				}

				$index = $string_end;
				continue;
			}

			if ( '{' === $char ) {
				++$depth;
				continue;
			}

			if ( '}' !== $char ) {
				continue;
			}

			--$depth;

			if ( 0 === $depth ) {
				return $index;
			}
		}

		return false;
	}

	/**
	 * Whether a CSS comment starts at the given offset.
	 *
	 * @param string $css   CSS string.
	 * @param int    $index Current offset.
	 * @return bool
	 */
	private static function css_starts_with_comment( $css, $index ) {
		return isset( $css[ $index ], $css[ $index + 1 ] ) && '/' === $css[ $index ] && '*' === $css[ $index + 1 ];
	}

	/**
	 * Find the closing offset of a CSS block comment.
	 *
	 * @param string $css   CSS string.
	 * @param int    $start Comment start offset.
	 * @return int|false
	 */
	private static function find_css_comment_end( $css, $start ) {
		$close = strpos( $css, '*/', $start + 2 );

		if ( false === $close ) {
			return false;
		}

		return $close + 1;
	}

	/**
	 * Skip a quoted CSS string and return the closing quote offset.
	 *
	 * @param string $css   CSS string.
	 * @param int    $start Opening quote offset.
	 * @return int|false
	 */
	private static function skip_css_string( $css, $start ) {
		$quote  = $css[ $start ];
		$length = strlen( $css );
		$index  = $start + 1;

		for ( ; $index < $length; $index++ ) {
			if ( '\\' === $css[ $index ] ) {
				++$index;
				continue;
			}

			if ( $quote === $css[ $index ] ) {
				return $index;
			}
		}

		return false;
	}

	/**
	 * Rewrite CSS declarations that leak outside a scoped HTML block.
	 *
	 * @param string $css Scoped CSS.
	 * @return string
	 */
	private static function fix_leaking_declarations( $css ) {
		$css = (string) $css;

		if ( '' === $css ) {
			return '';
		}

		$css = preg_replace( '/\bposition\s*:\s*fixed\b/i', 'position:absolute', $css );

		return is_string( $css ) ? $css : '';
	}
}
