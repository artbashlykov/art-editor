/**
 * ART Editor — site chrome hub autosave on toggle.
 */
(function () {
	'use strict';

	function init() {
		var form = document.querySelector('.art-editor-site-chrome-form');
		var switches;

		if (!form) {
			return;
		}

		switches = form.querySelectorAll('.art-editor-site-chrome-switch__input');

		Array.prototype.forEach.call(switches, function (input) {
			input.addEventListener('change', function () {
				// Do not disable inputs before submit — disabled checkboxes are omitted from POST.
				form.classList.add('is-saving');
				form.submit();
			});
		});
	}

	if ('loading' === document.readyState) {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
