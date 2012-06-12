﻿/*
Copyright (c) 2003-2011, CKSource - Frederico Knabben. All rights reserved.
For licensing, see LICENSE.html or http://ckeditor.com/license
*/

CKEDITOR.dialog.add( 'link', function( editor )
{
	var plugin = CKEDITOR.plugins.link;
	
	// These vars are specific to the autocompleter
	var autoCompleteCreated = false,
		autoCompleteUrl = jQuery('#autosuggestTitleUrl').attr('data-url'),
		autoCompleteTextbox,
		autoCompleteSelection;
	
	// Handles the event when the "Target" selection box is changed.
	var targetChanged = function()
	{
		var dialog = this.getDialog(),
			popupFeatures = dialog.getContentElement( 'target', 'popupFeatures' ),
			targetName = dialog.getContentElement( 'target', 'linkTargetName' ),
			value = this.getValue();

		if ( !popupFeatures || !targetName )
			return;

		popupFeatures = popupFeatures.getElement();
		popupFeatures.hide();
		targetName.setValue( '' );

		switch ( value )
 		{
			case 'frame' :
				targetName.setLabel( editor.lang.link.targetFrameName );
				targetName.getElement().show();
				break;
			case 'popup' :
				popupFeatures.show();
				targetName.setLabel( editor.lang.link.targetPopupName );
				targetName.getElement().show();
				break;
			default :
				targetName.setValue( value );
				targetName.getElement().hide();
				break;
 		}

	};

	// Handles the event when the "Type" selection box is changed.
	var linkTypeChanged = function()
	{
		
		var dialog = this.getDialog(),
			partIds = [ 'urlOptions', 'anchorOptions', 'emailOptions' ],
			typeValue = this.getValue(),
			uploadTab = dialog.definition.getContents( 'upload' ),
			uploadInitiallyHidden = uploadTab && uploadTab.hidden;

		if ( typeValue == 'url' )
		{
			if ( editor.config.linkShowTargetTab )
				dialog.showPage( 'target' );
			if ( !uploadInitiallyHidden )
				dialog.showPage( 'upload' );
		}
		else
		{
			dialog.hidePage( 'target' );
			if ( !uploadInitiallyHidden )
				dialog.hidePage( 'upload' );
		}

		for ( var i = 0 ; i < partIds.length ; i++ )
		{
			var element = dialog.getContentElement( 'info', partIds[i] );
			if ( !element )
				continue;

			element = element.getElement().getParent().getParent();
			if ( partIds[i] == typeValue + 'Options' )
				element.show();
			else
				element.hide();
		}

		dialog.layout();
	};

	// Loads the parameters in a selected link to the link dialog fields.
	var javascriptProtocolRegex = /^javascript:/,
		emailRegex = /^mailto:([^?]+)(?:\?(.+))?$/,
		emailSubjectRegex = /subject=([^;?:@&=$,\/]*)/,
		emailBodyRegex = /body=([^;?:@&=$,\/]*)/,
		anchorRegex = /^#(.*)$/,
		urlRegex = /^((?:http|https|ftp|news):\/\/)?(.*)$/,
		selectableTargets = /^(_(?:self|top|parent|blank))$/,
		encodedEmailLinkRegex = /^javascript:void\(location\.href='mailto:'\+String\.fromCharCode\(([^)]+)\)(?:\+'(.*)')?\)$/,
		functionCallProtectedEmailLinkRegex = /^javascript:([^(]+)\(([^)]+)\)$/;

	var popupRegex =
		/\s*window.open\(\s*this\.href\s*,\s*(?:'([^']*)'|null)\s*,\s*'([^']*)'\s*\)\s*;\s*return\s*false;*\s*/;
	var popupFeaturesRegex = /(?:^|,)([^=]+)=(\d+|yes|no)/gi;

	var parseLink = function( editor, element )
	{
		var href = ( element  && ( element.data( 'cke-saved-href' ) || element.getAttribute( 'href' ) ) ) || '',
		 	javascriptMatch,
			emailMatch,
			anchorMatch,
			urlMatch,
			retval = {};

		if ( ( javascriptMatch = href.match( javascriptProtocolRegex ) ) )
		{
			if ( emailProtection == 'encode' )
			{
				href = href.replace( encodedEmailLinkRegex,
						function ( match, protectedAddress, rest )
						{
							return 'mailto:' +
							       String.fromCharCode.apply( String, protectedAddress.split( ',' ) ) +
							       ( rest && unescapeSingleQuote( rest ) );
						});
			}
			// Protected email link as function call.
			else if ( emailProtection )
			{
				href.replace( functionCallProtectedEmailLinkRegex, function( match, funcName, funcArgs )
				{
					if ( funcName == compiledProtectionFunction.name )
					{
						retval.type = 'email';
						var email = retval.email = {};

						var paramRegex = /[^,\s]+/g,
							paramQuoteRegex = /(^')|('$)/g,
							paramsMatch = funcArgs.match( paramRegex ),
							paramsMatchLength = paramsMatch.length,
							paramName,
							paramVal;

						for ( var i = 0; i < paramsMatchLength; i++ )
						{
							paramVal = decodeURIComponent( unescapeSingleQuote( paramsMatch[ i ].replace( paramQuoteRegex, '' ) ) );
							paramName = compiledProtectionFunction.params[ i ].toLowerCase();
							email[ paramName ] = paramVal;
						}
						email.address = [ email.name, email.domain ].join( '@' );
					}
				} );
			}
		}

		if ( !retval.type )
		{
			if ( ( anchorMatch = href.match( anchorRegex ) ) )
			{
				retval.type = 'anchor';
				retval.anchor = {};
				retval.anchor.name = retval.anchor.id = anchorMatch[1];
			}
			// Protected email link as encoded string.
			else if ( ( emailMatch = href.match( emailRegex ) ) )
			{
				var subjectMatch = href.match( emailSubjectRegex ),
					bodyMatch = href.match( emailBodyRegex );

				retval.type = 'email';
				var email = ( retval.email = {} );
				email.address = emailMatch[ 1 ];
				subjectMatch && ( email.subject = decodeURIComponent( subjectMatch[ 1 ] ) );
				bodyMatch && ( email.body = decodeURIComponent( bodyMatch[ 1 ] ) );
			}
			// urlRegex matches empty strings, so need to check for href as well.
			else if (  href && ( urlMatch = href.match( urlRegex ) ) )
			{
				retval.type = 'url';
				retval.url = {
					url: href
				};
			}
			else
				retval.type = 'url';
		}

		// Load target and popup settings.
		if ( element )
		{
			var target = element.getAttribute( 'target' );
			retval.target = {};
			retval.adv = {};

			// IE BUG: target attribute is an empty string instead of null in IE if it's not set.
			if ( !target )
			{
				var onclick = element.data( 'cke-pa-onclick' ) || element.getAttribute( 'onclick' ),
					onclickMatch = onclick && onclick.match( popupRegex );
				if ( onclickMatch )
				{
					retval.target.type = 'popup';
					retval.target.name = onclickMatch[1];

					var featureMatch;
					while ( ( featureMatch = popupFeaturesRegex.exec( onclickMatch[2] ) ) )
					{
						// Some values should remain numbers (#7300)
						if ( ( featureMatch[2] == 'yes' || featureMatch[2] == '1' ) && !( featureMatch[1] in { height:1, width:1, top:1, left:1 } ) )
							retval.target[ featureMatch[1] ] = true;
						else if ( isFinite( featureMatch[2] ) )
							retval.target[ featureMatch[1] ] = featureMatch[2];
					}
				}
			}
			else
			{
				var targetMatch = target.match( selectableTargets );
				if ( targetMatch )
					retval.target.type = retval.target.name = target;
				else
				{
					retval.target.type = 'frame';
					retval.target.name = target;
				}
			}

			var me = this;
			var advAttr = function( inputName, attrName )
			{
				var value = element.getAttribute( attrName );
				if ( value !== null )
					retval.adv[ inputName ] = value || '';
			};
			advAttr( 'advId', 'id' );
			advAttr( 'advLangDir', 'dir' );
			advAttr( 'advAccessKey', 'accessKey' );

			retval.adv.advName =
				element.data( 'cke-saved-name' )
				|| element.getAttribute( 'name' )
				|| '';
			advAttr( 'advLangCode', 'lang' );
			advAttr( 'advTabIndex', 'tabindex' );
			advAttr( 'advTitle', 'title' );
			advAttr( 'advContentType', 'type' );
			CKEDITOR.plugins.link.synAnchorSelector ?
				retval.adv.advCSSClasses = getLinkClass( element )
				: advAttr( 'advCSSClasses', 'class' );
			advAttr( 'advCharset', 'charset' );
			advAttr( 'advStyles', 'style' );
			advAttr( 'advRel', 'rel' );
		}

		// Find out whether we have any anchors in the editor.
		var anchors = retval.anchors = [],
			item;

		// For some browsers we set contenteditable="false" on anchors, making document.anchors not to include them, so we must traverse the links manually (#7893).
		if ( CKEDITOR.plugins.link.emptyAnchorFix )
		{
			var links = editor.document.getElementsByTag( 'a' );
			for ( i = 0, count = links.count(); i < count; i++ )
			{
				item = links.getItem( i );
				if ( item.data( 'cke-saved-name' ) || item.hasAttribute( 'name' ) )
					anchors.push( { name : item.data( 'cke-saved-name' ) || item.getAttribute( 'name' ), id : item.getAttribute( 'id' ) } );
			}
		}
		else
		{
			var anchorList = new CKEDITOR.dom.nodeList( editor.document.$.anchors );
			for ( var i = 0, count = anchorList.count(); i < count; i++ )
			{
				item = anchorList.getItem( i );
				anchors[ i ] = { name : item.getAttribute( 'name' ), id : item.getAttribute( 'id' ) };
			}
		}

		if ( CKEDITOR.plugins.link.fakeAnchor )
		{
			var imgs = editor.document.getElementsByTag( 'img' );
			for ( i = 0, count = imgs.count(); i < count; i++ )
			{
				if ( ( item = CKEDITOR.plugins.link.tryRestoreFakeAnchor( editor, imgs.getItem( i ) ) ) )
					anchors.push( { name : item.getAttribute( 'name' ), id : item.getAttribute( 'id' ) } );
			}
		}

		// Record down the selected element in the dialog.
		this._.selectedElement = element;
		return retval;
	};

	var setupParams = function( page, data )
	{
		if ( data[page] )
			this.setValue( data[page][this.id] || '' );
	};

	var setupPopupParams = function( data )
	{
		return setupParams.call( this, 'target', data );
	};

	var setupAdvParams = function( data )
	{
		return setupParams.call( this, 'adv', data );
	};

	var commitParams = function( page, data )
	{
		if ( !data[page] )
			data[page] = {};

		data[page][this.id] = this.getValue() || '';
	};

	var commitPopupParams = function( data )
	{
		return commitParams.call( this, 'target', data );
	};

	var commitAdvParams = function( data )
	{
		return commitParams.call( this, 'adv', data );
	};

	function unescapeSingleQuote( str )
	{
		return str.replace( /\\'/g, '\'' );
	}

	function escapeSingleQuote( str )
	{
		return str.replace( /'/g, '\\$&' );
	}

	var emailProtection = editor.config.emailProtection || '';

	// Compile the protection function pattern.
	if ( emailProtection && emailProtection != 'encode' )
	{
		var compiledProtectionFunction = {};

		emailProtection.replace( /^([^(]+)\(([^)]+)\)$/, function( match, funcName, params )
		{
			compiledProtectionFunction.name = funcName;
			compiledProtectionFunction.params = [];
			params.replace( /[^,\s]+/g, function( param )
			{
				compiledProtectionFunction.params.push( param );
			} );
		} );
	}

	function protectEmailLinkAsFunction( email )
	{
		var retval,
			name = compiledProtectionFunction.name,
			params = compiledProtectionFunction.params,
			paramName,
			paramValue;

		retval = [ name, '(' ];
		for ( var i = 0; i < params.length; i++ )
		{
			paramName = params[ i ].toLowerCase();
			paramValue = email[ paramName ];

			i > 0 && retval.push( ',' );
			retval.push( '\'',
						 paramValue ?
						 escapeSingleQuote( encodeURIComponent( email[ paramName ] ) )
						 : '',
						 '\'');
		}
		retval.push( ')' );
		return retval.join( '' );
	}

	function protectEmailAddressAsEncodedString( address )
	{
		var charCode,
			length = address.length,
			encodedChars = [];
		for ( var i = 0; i < length; i++ )
		{
			charCode = address.charCodeAt( i );
			encodedChars.push( charCode );
		}
		return 'String.fromCharCode(' + encodedChars.join( ',' ) + ')';
	}

	function getLinkClass( ele )
	{
		var className = ele.getAttribute( 'class' );
		return className ? className.replace( /\s*(?:cke_anchor_empty|cke_anchor)(?:\s*$)?/g, '' ) : '';
	}

	var commonLang = editor.lang.common,
		linkLang = editor.lang.link;
	
	// Runs whenever an item is selected from the dropdown or the enter key is press in box
	function autoCompleteSelect(dialog, submit) {
		// Set the link in the "link" pane, put value into place
		//dialog.selectPage("info");
		dialog.setValueOf('info', 'url', autoCompleteSelection.href);
		
		// Trigger "OK"
		if(submit) {
			dialog.definition.onOk.call(dialog);
			dialog.hide();
		}
	}
		
		
	return {
		title : linkLang.title,
		minWidth : 350,
		minHeight : 230,
		contents : [
			{
				id : 'info',
				label : linkLang.info,
				title : linkLang.info,
				elements :
				[
					{
						id : 'linkType',
						type : 'select',
						label : linkLang.type,
						'default' : 'url',
						items :
						[
							[ linkLang.toUrl, 'url' ],
							[ linkLang.toAnchor, 'anchor' ],
							[ linkLang.toEmail, 'email' ]
						],
						onChange : linkTypeChanged,
						setup : function( data )
						{
							if ( data.type )
								this.setValue( data.type );
						},
						commit : function( data )
						{
							data.type = this.getValue();
						}
					},
					{
						type : 'vbox',
						id : 'urlOptions',
						children :
						[
							{
								id: 'articleName',
								type: 'text',
								label: gettext('Article Title'),
								setup: function() {
									// This happens upon every open, so need to make sure we don't keep creating new autocompleters!
									var dialog = this.getDialog(),
										term;
									
									// Create widget if not done already
									if(!autoCompleteTextbox) {
										autoCompleteTextbox = this.getElement().getElementsByTag('input').$[0];
										
										jQuery(autoCompleteTextbox).mozillaAutocomplete({
											minLength: 1,
											requireValidOption: true,
											styleElement: autoCompleteTextbox.parentNode,
											autocompleteUrl: autoCompleteUrl,
											onSelect: function(item, isSilent) {
												autoCompleteSelection = item;
												// Select item
												autoCompleteSelect(dialog, !isSilent);
											},
											_renderItem: function(ul, item) {
												return jQuery('<li></li>')
													.data("item.autocomplete", item)
													.attr('title', item.href)
													.append(jQuery('<a></a>').text(item.label))
													.appendTo(ul);
											}
										});
									}
									
									// Clear out the the values so there aren't any problems
									jQuery(autoCompleteTextbox).mozillaAutocomplete('clear');
								}
							},
							{
								type : 'hbox',
								widths : [ '0', '100%' ],
								children :
								[
									{
										type : 'text',
										id : 'url',
										label : commonLang.url,
										required: true,
										onLoad : function ()
										{
											this.allowOnChange = true;
										},
										onKeyUp : function()
										{
											this.allowOnChange = false;
											var	url = this.getValue(),
												urlOnChangeProtocol = /^(http|https|ftp|news):\/\/(?=.)/i,
												urlOnChangeTestOther = /^((javascript:)|[#\/\.\?])/i;

											this.allowOnChange = true;
										},
										onChange : function()
										{
											if ( this.allowOnChange )		// Dont't call on dialog load.
												this.onKeyUp();
										},
										validate : function()
										{
											var dialog = this.getDialog();

											if ( dialog.getContentElement( 'info', 'linkType' ) &&
													dialog.getValueOf( 'info', 'linkType' ) != 'url' )
												return true;

											if ( this.getDialog().fakeObj )	// Edit Anchor.
												return true;
											
											
											
											var func = CKEDITOR.dialog.validate.notEmpty( linkLang.noUrl );
											return func.apply( this );
										},
										setup : function( data )
										{
											this.allowOnChange = false;
											if ( data.url )
												this.setValue( data.url.url );
											this.allowOnChange = true;

										},
										commit : function( data )
										{
											// IE will not trigger the onChange event if the mouse has been used
											// to carry all the operations #4724
											this.onChange();

											if ( !data.url )
												data.url = {};

											data.url.url = this.getValue();
											this.allowOnChange = false;
										}
									}
								],
								setup : function( data )
								{
									if ( !this.getDialog().getContentElement( 'info', 'linkType' ) )
										this.getElement().show();
								}
							},
							{
								type : 'button',
								id : 'browse',
								hidden : 'true',
								filebrowser : 'info:url',
								label : commonLang.browseServer
							}
						]
					},
					{
						type : 'vbox',
						id : 'anchorOptions',
						width : 260,
						align : 'center',
						padding : 0,
						children :
						[
							{
								type : 'fieldset',
								id : 'selectAnchorText',
								label : linkLang.selectAnchor,
								setup : function( data )
								{
									if ( data.anchors.length > 0 )
										this.getElement().show();
									else
										this.getElement().hide();
								},
								children :
								[
									{
										type : 'hbox',
										id : 'selectAnchor',
										children :
										[
											{
												type : 'select',
												id : 'anchorName',
												'default' : '',
												label : linkLang.anchorName,
												style : 'width: 100%;',
												items :
												[
													[ '' ]
												],
												setup : function( data )
												{
													this.clear();
													this.add( '' );
													for ( var i = 0 ; i < data.anchors.length ; i++ )
													{
														if ( data.anchors[i].name )
															this.add( data.anchors[i].name );
													}

													if ( data.anchor )
														this.setValue( data.anchor.name );

													var linkType = this.getDialog().getContentElement( 'info', 'linkType' );
													if ( linkType && linkType.getValue() == 'email' )
														this.focus();
												},
												commit : function( data )
												{
													if ( !data.anchor )
														data.anchor = {};

													data.anchor.name = this.getValue();
												}
											},
											{
												type : 'select',
												id : 'anchorId',
												'default' : '',
												label : linkLang.anchorId,
												style : 'width: 100%;',
												items :
												[
													[ '' ]
												],
												setup : function( data )
												{
													this.clear();
													this.add( '' );
													for ( var i = 0 ; i < data.anchors.length ; i++ )
													{
														if ( data.anchors[i].id )
															this.add( data.anchors[i].id );
													}

													if ( data.anchor )
														this.setValue( data.anchor.id );
												},
												commit : function( data )
												{
													if ( !data.anchor )
														data.anchor = {};

													data.anchor.id = this.getValue();
												}
											}
										],
										setup : function( data )
										{
											if ( data.anchors.length > 0 )
												this.getElement().show();
											else
												this.getElement().hide();
										}
									}
								]
							},
							{
								type : 'html',
								id : 'noAnchors',
								style : 'text-align: center;',
								html : '<div role="label" tabIndex="-1">' + CKEDITOR.tools.htmlEncode( linkLang.noAnchors ) + '</div>',
								// Focus the first element defined in above html.
								focus : true,
								setup : function( data )
								{
									if ( data.anchors.length < 1 )
										this.getElement().show();
									else
										this.getElement().hide();
								}
							}
						],
						setup : function( data )
						{
							if ( !this.getDialog().getContentElement( 'info', 'linkType' ) )
								this.getElement().hide();
						}
					},
					{
						type :  'vbox',
						id : 'emailOptions',
						padding : 1,
						children :
						[
							{
								type : 'text',
								id : 'emailAddress',
								label : linkLang.emailAddress,
								required : true,
								validate : function()
								{
									var dialog = this.getDialog();

									if ( !dialog.getContentElement( 'info', 'linkType' ) ||
											dialog.getValueOf( 'info', 'linkType' ) != 'email' )
										return true;

									var func = CKEDITOR.dialog.validate.notEmpty( linkLang.noEmail );
									return func.apply( this );
								},
								setup : function( data )
								{
									if ( data.email )
										this.setValue( data.email.address );

									var linkType = this.getDialog().getContentElement( 'info', 'linkType' );
									if ( linkType && linkType.getValue() == 'email' )
										this.select();
								},
								commit : function( data )
								{
									if ( !data.email )
										data.email = {};

									data.email.address = this.getValue();
								}
							},
							{
								type : 'text',
								id : 'emailSubject',
								label : linkLang.emailSubject,
								setup : function( data )
								{
									if ( data.email )
										this.setValue( data.email.subject );
								},
								commit : function( data )
								{
									if ( !data.email )
										data.email = {};

									data.email.subject = this.getValue();
								}
							},
							{
								type : 'textarea',
								id : 'emailBody',
								label : linkLang.emailBody,
								rows : 3,
								'default' : '',
								setup : function( data )
								{
									if ( data.email )
										this.setValue( data.email.body );
								},
								commit : function( data )
								{
									if ( !data.email )
										data.email = {};

									data.email.body = this.getValue();
								}
							}
						],
						setup : function( data )
						{
							if ( !this.getDialog().getContentElement( 'info', 'linkType' ) )
								this.getElement().hide();
						}
					}
				]
			},
			{
				id : 'upload',
				label : linkLang.upload,
				title : linkLang.upload,
				hidden : true,
				filebrowser : 'uploadButton',
				elements :
				[
					{
						type : 'file',
						id : 'upload',
						label : commonLang.upload,
						style: 'height:40px',
						size : 29
					},
					{
						type : 'fileButton',
						id : 'uploadButton',
						label : commonLang.uploadSubmit,
						filebrowser : 'info:url',
						'for' : [ 'upload', 'upload' ]
					}
				]
			},
			{
				id : 'advanced',
				label : linkLang.advanced,
				title : linkLang.advanced,
				elements :
				[
					{
						type : 'vbox',
						padding : 1,
						children :
						[
							{
								type : 'hbox',
								widths : [ '45%', '35%', '20%' ],
								children :
								[
									{
										type : 'text',
										id : 'advId',
										label : linkLang.id,
										setup : setupAdvParams,
										commit : commitAdvParams
									},
									{
										type : 'select',
										id : 'advLangDir',
										label : linkLang.langDir,
										'default' : '',
										style : 'width:110px',
										items :
										[
											[ commonLang.notSet, '' ],
											[ linkLang.langDirLTR, 'ltr' ],
											[ linkLang.langDirRTL, 'rtl' ]
										],
										setup : setupAdvParams,
										commit : commitAdvParams
									},
									{
										type : 'text',
										id : 'advAccessKey',
										width : '80px',
										label : linkLang.acccessKey,
										maxLength : 1,
										setup : setupAdvParams,
										commit : commitAdvParams

									}
								]
							},
							{
								type : 'hbox',
								widths : [ '45%', '35%', '20%' ],
								children :
								[
									{
										type : 'text',
										label : linkLang.name,
										id : 'advName',
										setup : setupAdvParams,
										commit : commitAdvParams

									},
									{
										type : 'text',
										label : linkLang.langCode,
										id : 'advLangCode',
										width : '110px',
										'default' : '',
										setup : setupAdvParams,
										commit : commitAdvParams

									},
									{
										type : 'text',
										label : linkLang.tabIndex,
										id : 'advTabIndex',
										width : '80px',
										maxLength : 5,
										setup : setupAdvParams,
										commit : commitAdvParams

									}
								]
							}
						]
					},
					{
						type : 'vbox',
						padding : 1,
						children :
						[
							{
								type : 'hbox',
								widths : [ '45%', '55%' ],
								children :
								[
									{
										type : 'text',
										label : linkLang.advisoryTitle,
										'default' : '',
										id : 'advTitle',
										setup : setupAdvParams,
										commit : commitAdvParams

									},
									{
										type : 'text',
										label : linkLang.advisoryContentType,
										'default' : '',
										id : 'advContentType',
										setup : setupAdvParams,
										commit : commitAdvParams

									}
								]
							},
							{
								type : 'hbox',
								widths : [ '45%', '55%' ],
								children :
								[
									{
										type : 'text',
										label : linkLang.cssClasses,
										'default' : '',
										id : 'advCSSClasses',
										setup : setupAdvParams,
										commit : commitAdvParams

									},
									{
										type : 'text',
										label : linkLang.charset,
										'default' : '',
										id : 'advCharset',
										setup : setupAdvParams,
										commit : commitAdvParams

									}
								]
							},
							{
								type : 'hbox',
								widths : [ '45%', '55%' ],
								children :
								[
									{
										type : 'text',
										label : linkLang.rel,
										'default' : '',
										id : 'advRel',
										setup : setupAdvParams,
										commit : commitAdvParams
									},
									{
										type : 'text',
										label : linkLang.styles,
										'default' : '',
										id : 'advStyles',
										validate : CKEDITOR.dialog.validate.inlineStyle( editor.lang.common.invalidInlineStyle ),
										setup : setupAdvParams,
										commit : commitAdvParams
									}
								]
							}
						]
					}
				]
			}
		],
		onShow : function()
		{
			var editor = this.getParentEditor(),
				selection = editor.getSelection(),
				element = null;

			// Fill in all the relevant fields if there's already one link selected.
			if ( ( element = plugin.getSelectedLink( editor ) ) && element.hasAttribute( 'href' ) )
				selection.selectElement( element );
			else
				element = null;

			this.setupContent( parseLink.apply( this, [ editor, element ] ) );
			
			// If there's an element, don't take action, let the editor handle it
			this.hasSourceElement = !(element == null);
		},
		onOk : function()
		{
			var attributes = {},
				removeAttributes = [],
				data = {},
				me = this,
				editor = this.getParentEditor();

			this.commitContent( data );

			// Compose the URL.
			switch ( data.type || 'url' )
			{
				case 'url':
					var url = ( data.url && CKEDITOR.tools.trim( data.url.url ) ) || '',
						useOriginal = url.indexOf( '/' ) === 0 || 	// ex: "/some/page"
									  url.indexOf('#') === 0 || 	// ex: "someAnchor"
									  url.indexOf('//') > -1 ; 		// ex: "http://mozilla.com" or "https://mozilla.com"
					
					attributes[ 'data-cke-saved-href' ] = useOriginal ? url : 'http://' + url;
					
					break;
				case 'anchor':
					var name = ( data.anchor && data.anchor.name ),
						id = ( data.anchor && data.anchor.id );
					attributes[ 'data-cke-saved-href' ] = '#' + ( name || id || '' );
					break;
				case 'email':

					var linkHref,
						email = data.email,
						address = email.address;

					switch( emailProtection )
					{
						case '' :
						case 'encode' :
						{
							var subject = encodeURIComponent( email.subject || '' ),
								body = encodeURIComponent( email.body || '' );

							// Build the e-mail parameters first.
							var argList = [];
							subject && argList.push( 'subject=' + subject );
							body && argList.push( 'body=' + body );
							argList = argList.length ? '?' + argList.join( '&' ) : '';

							if ( emailProtection == 'encode' )
							{
								linkHref = [ 'javascript:void(location.href=\'mailto:\'+',
											 protectEmailAddressAsEncodedString( address ) ];
								// parameters are optional.
								argList && linkHref.push( '+\'', escapeSingleQuote( argList ), '\'' );

								linkHref.push( ')' );
							}
							else
								linkHref = [ 'mailto:', address, argList ];

							break;
						}
						default :
						{
							// Separating name and domain.
							var nameAndDomain = address.split( '@', 2 );
							email.name = nameAndDomain[ 0 ];
							email.domain = nameAndDomain[ 1 ];

							linkHref = [ 'javascript:', protectEmailLinkAsFunction( email ) ];
						}
					}

					attributes[ 'data-cke-saved-href' ] = linkHref.join( '' );
					break;
			}

			// Popups and target.
			if ( data.target )
			{
				if ( data.target.type == 'popup' )
				{
					var onclickList = [ 'window.open(this.href, \'',
							data.target.name || '', '\', \'' ];
					var featureList = [ 'resizable', 'status', 'location', 'toolbar', 'menubar', 'fullscreen',
							'scrollbars', 'dependent' ];
					var featureLength = featureList.length;
					var addFeature = function( featureName )
					{
						if ( data.target[ featureName ] )
							featureList.push( featureName + '=' + data.target[ featureName ] );
					};

					for ( var i = 0 ; i < featureLength ; i++ )
						featureList[i] = featureList[i] + ( data.target[ featureList[i] ] ? '=yes' : '=no' ) ;
					addFeature( 'width' );
					addFeature( 'left' );
					addFeature( 'height' );
					addFeature( 'top' );

					onclickList.push( featureList.join( ',' ), '\'); return false;' );
					attributes[ 'data-cke-pa-onclick' ] = onclickList.join( '' );

					// Add the "target" attribute. (#5074)
					removeAttributes.push( 'target' );
				}
				else
				{
					if ( data.target.type != 'notSet' && data.target.name )
						attributes.target = data.target.name;
					else
						removeAttributes.push( 'target' );

					removeAttributes.push( 'data-cke-pa-onclick', 'onclick' );
				}
			}

			// Advanced attributes.
			if ( data.adv )
			{
				var advAttr = function( inputName, attrName )
				{
					var value = data.adv[ inputName ];
					if ( value )
						attributes[attrName] = value;
					else
						removeAttributes.push( attrName );
				};

				advAttr( 'advId', 'id' );
				advAttr( 'advLangDir', 'dir' );
				advAttr( 'advAccessKey', 'accessKey' );

				if ( data.adv[ 'advName' ] )
					attributes[ 'name' ] = attributes[ 'data-cke-saved-name' ] = data.adv[ 'advName' ];
				else
					removeAttributes = removeAttributes.concat( [ 'data-cke-saved-name', 'name' ] );

				advAttr( 'advLangCode', 'lang' );
				advAttr( 'advTabIndex', 'tabindex' );
				advAttr( 'advTitle', 'title' );
				advAttr( 'advContentType', 'type' );
				advAttr( 'advCSSClasses', 'class' );
				advAttr( 'advCharset', 'charset' );
				advAttr( 'advStyles', 'style' );
				advAttr( 'advRel', 'rel' );
			}


			// Browser need the "href" fro copy/paste link to work. (#6641)
			attributes.href = attributes[ 'data-cke-saved-href' ];

			if ( !this._.selectedElement )
			{
				// Create element if current selection is collapsed.
				var selection = editor.getSelection(),
					ranges = selection.getRanges( true );
				if ( ranges.length == 1 && ranges[0].collapsed )
				{
					// Short mailto link text view (#5736).
					var text = new CKEDITOR.dom.text( data.type == 'email' ?
							data.email.address : (autoCompleteSelection ? autoCompleteSelection.label : attributes[ 'data-cke-saved-href' ]), editor.document );
					ranges[0].insertNode( text );
					ranges[0].selectNodeContents( text );
					selection.selectRanges( ranges );
				}

				// Apply style.
				var style = new CKEDITOR.style( { element : 'a', attributes : attributes } );
				style.type = CKEDITOR.STYLE_INLINE;		// need to override... dunno why.
				style.apply( editor.document );
			}
			else
			{
				// We're only editing an existing link, so just overwrite the attributes.
				var element = this._.selectedElement,
					href = element.data( 'cke-saved-href' ),
					textView = element.getHtml();

				element.setAttributes( attributes );
				element.removeAttributes( removeAttributes );

				if ( data.adv && data.adv.advName && CKEDITOR.plugins.link.synAnchorSelector )
					element.addClass( element.getChildCount() ? 'cke_anchor' : 'cke_anchor_empty' );

				// Update text view when user changes protocol (#4612).
				if ( href == textView || data.type == 'email' && textView.indexOf( '@' ) != -1 )
				{
					// Short mailto link text view (#5736).
					element.setHtml( data.type == 'email' ?
						data.email.address : attributes[ 'data-cke-saved-href' ] );
				}

				delete this._.selectedElement;
			}
		},
		onLoad : function()
		{
			if ( !editor.config.linkShowAdvancedTab )
				this.hidePage( 'advanced' );		//Hide Advanced tab.

			if ( !editor.config.linkShowTargetTab )
				this.hidePage( 'target' );		//Hide Target tab.
		},
		// Inital focus on 'url' field if link is of type URL.;  this fires whenever the dialog is opened
		onFocus : function()
		{
			var selectedText = editor.getSelection().getSelectedText(),
				selectedElement = editor.getSelection().getSelectedElement();
				
			// Clear out the previous auto-creation text
			autoCompleteSelection = null;
			
			// If there's selected text but not an element, search for an article
			if(selectedText && !selectedElement) {
				jQuery(autoCompleteTextbox).val(selectedText);
				jQuery(autoCompleteTextbox).mozillaAutocomplete('deselect');
				jQuery(autoCompleteTextbox).mozillaAutocomplete('search', selectedText);
				autoCompleteTextbox.select();
				return;
			}
			
			// Select the URL field
			this.getContentElement( 'info', 'url' ).select();
		}
	};
	
});

/**
 * The e-mail address anti-spam protection option. The protection will be
 * applied when creating or modifying e-mail links through the editor interface.<br>
 * Two methods of protection can be choosed:
 * <ol>	<li>The e-mail parts (name, domain and any other query string) are
 *			assembled into a function call pattern. Such function must be
 *			provided by the developer in the pages that will use the contents.
 *		<li>Only the e-mail address is obfuscated into a special string that
 *			has no meaning for humans or spam bots, but which is properly
 *			rendered and accepted by the browser.</li></ol>
 * Both approaches require JavaScript to be enabled.
 * @name CKEDITOR.config.emailProtection
 * @since 3.1
 * @type String
 * @default '' (empty string = disabled)
 * @example
 * // href="mailto:tester@ckeditor.com?subject=subject&body=body"
 * config.emailProtection = '';
 * @example
 * // href="<a href=\"javascript:void(location.href=\'mailto:\'+String.fromCharCode(116,101,115,116,101,114,64,99,107,101,100,105,116,111,114,46,99,111,109)+\'?subject=subject&body=body\')\">e-mail</a>"
 * config.emailProtection = 'encode';
 * @example
 * // href="javascript:mt('tester','ckeditor.com','subject','body')"
 * config.emailProtection = 'mt(NAME,DOMAIN,SUBJECT,BODY)';
 */