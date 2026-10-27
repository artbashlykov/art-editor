/**
 * Append the current page query string to landing links.
 *
 * Enabled per page via ART Editor page settings.
 */
(function () {
	'use strict';

	var STORAGE_KEY = 'art-editor-pass-query-v1';
	var BLOCKED_KEYS = {
		preview: 1,
		preview_id: 1,
		preview_nonce: 1,
		p: 1,
		page_id: 1,
		post_type: 1,
		_wpnonce: 1,
		nonce: 1,
		_ajax_nonce: 1,
		ver: 1,
		tb: 1,
		replytocom: 1,
		customize_changeset_uuid: 1,
		customize_messenger_channel: 1,
		customize_autosaved: 1,
		'elementor-preview': 1,
		elementor_library: 1,
		rest_route: 1,
		_locale: 1,
		wp_lang: 1
	};

	function isBlockedKey(key) {
		return !!BLOCKED_KEYS[String(key || '').toLowerCase()];
	}

	function filterSearchParams(searchParams) {
		var filtered = new URLSearchParams();
		var key;

		if (!searchParams) {
			return filtered;
		}

		searchParams.forEach(function (value, name) {
			key = String(name || '');

			if (!key || isBlockedKey(key)) {
				return;
			}

			filtered.append(key, value);
		});

		return filtered;
	}

	function readStoredQuery() {
		var raw;

		try {
			raw = window.sessionStorage.getItem(STORAGE_KEY);
		} catch (e) {
			return new URLSearchParams();
		}

		if (!raw) {
			return new URLSearchParams();
		}

		try {
			return filterSearchParams(new URLSearchParams(raw));
		} catch (e2) {
			return new URLSearchParams();
		}
	}

	function writeStoredQuery(searchParams) {
		var serialized = searchParams.toString();

		try {
			if (serialized) {
				window.sessionStorage.setItem(STORAGE_KEY, serialized);
			}
		} catch (e) {
			// Ignore private-mode / quota errors.
		}
	}

	function resolveActiveParams() {
		var fromUrl = filterSearchParams(new URLSearchParams(window.location.search || ''));

		if (fromUrl.toString()) {
			writeStoredQuery(fromUrl);
			return fromUrl;
		}

		return readStoredQuery();
	}

	function shouldSkipHref(href) {
		var trimmed;
		var lower;

		if ('string' !== typeof href) {
			return true;
		}

		trimmed = href.trim();

		if (!trimmed || '#' === trimmed) {
			return true;
		}

		lower = trimmed.toLowerCase();

		return (
			0 === lower.indexOf('javascript:') ||
			0 === lower.indexOf('mailto:') ||
			0 === lower.indexOf('tel:') ||
			0 === lower.indexOf('sms:') ||
			0 === lower.indexOf('data:')
		);
	}

	function applyParamsToHref(href, params) {
		var serialized;
		var url;
		var hashOnly;

		if (shouldSkipHref(href) || !params) {
			return href;
		}

		serialized = params.toString();

		if (!serialized) {
			return href;
		}

		hashOnly = href.trim();

		if ('#' === hashOnly.charAt(0)) {
			return '?' + serialized + hashOnly;
		}

		try {
			url = new URL(href, window.location.href);

			params.forEach(function (value, key) {
				if (!url.searchParams.has(key)) {
					url.searchParams.append(key, value);
				}
			});

			return url.toString();
		} catch (e) {
			return href;
		}
	}

	function decorateAnchor(anchor, params) {
		var current;
		var next;

		if (!anchor || !anchor.getAttribute) {
			return;
		}

		current = anchor.getAttribute('href');

		if (shouldSkipHref(current)) {
			return;
		}

		next = applyParamsToHref(current, params);

		if (next && next !== current) {
			anchor.setAttribute('href', next);
		}
	}

	function decorateAllLinks(params) {
		var anchors = document.querySelectorAll('a[href]');
		var index;

		for (index = 0; index < anchors.length; index++) {
			decorateAnchor(anchors[index], params);
		}
	}

	function init() {
		var params = resolveActiveParams();

		if (!params.toString()) {
			return;
		}

		decorateAllLinks(params);

		document.addEventListener(
			'click',
			function (event) {
				var target = event.target;
				var anchor;

				if (!target || !target.closest) {
					return;
				}

				anchor = target.closest('a[href]');

				if (!anchor) {
					return;
				}

				decorateAnchor(anchor, params);
			},
			true
		);
	}

	if ('loading' === document.readyState) {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
