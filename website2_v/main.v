module main

import net.http
import os
import sync
import time
import traffic
import veb

const port = 8082
const visit_cookie_name = 'vlang_session_visit'
const contact_email = 'alexander@vlang.io'

pub struct App {
	veb.StaticHandler
mut:
	traffic       &traffic.Tracker = unsafe { nil }
	stats_traffic &traffic.Tracker = unsafe { nil }
	traffic_lock  sync.Mutex
}

pub struct Context {
	veb.Context
mut:
	lang Lang
}

enum Lang {
	en
	ru
	// cn
	// es
	// pt
	// fr
	// jp
}

// pub fn (app App) before_request() {
// println('[web] before_request: ${app.req.method} ${app.req.url}')
//}

fn main() {
	conninfo := os.getenv('VLANG_DB_CONNINFO')
	mut app := &App{
	}
	if conninfo != '' {
		app.traffic = traffic.new(traffic.Config{
			conninfo: conninfo
			site_id:  'vlang.io'
		}) or { panic('Could not initialise traffic tracking: ${err}') }
		app.stats_traffic = traffic.new(traffic.Config{
			conninfo: conninfo
			site_id:  'vlang.io'
		}) or { panic('Could not initialise traffic statistics: ${err}') }
	} else {
		eprintln('Traffic tracking is disabled (set VLANG_DB_CONNINFO to enable it).')
	}
	app.static_mime_types['.vtt'] = 'text/vtt; charset=utf-8'
	// app.serve_static('/favicon.ico', 'src/assets/favicon.ico')
	// makes all static files available.
	app.mount_static_folder_at(os.resource_abs_path('static'), '/')!
	/*
	app.mount_static_folder_at(os.resource_abs_path('.'), '/') or {
		println(err)
		return
	}
	*/

	veb.run[App, Context](mut app, port)
}

pub fn (mut app App) index(mut ctx Context) veb.Result {
	ctx.set_lang() // TODO use middleware
	user_agent := ctx.req.header.get(.user_agent) or { '' }
	if traffic.is_bot_request(user_agent, ctx.req.url) {
		// Crawlers do not reliably retain cookies, so preserve each event while
		// the tracker keeps it out of the human totals.
		app.record_home_visit(ctx)
	} else if ctx.get_cookie(visit_cookie_name) == none {
		// Count at most once per browser session. The cookie is never stored.
		app.record_home_visit(ctx)
		ctx.set_cookie(http.Cookie{
			name:      visit_cookie_name
			value:     '1'
			path:      '/'
			secure:    true
			http_only: true
			same_site: .same_site_lax_mode
		})
	}

	return $veb.html('index.html')
}

@['/compare']
pub fn (mut app App) compare(mut ctx Context) veb.Result {
	ctx.set_lang()
	return $veb.html('templates/compare.html')
}

@['/utc_now']
pub fn (mut app App) utc_now(mut ctx Context) veb.Result {
	return ctx.text(time.now().unix().str())
}

@['/stats228']
pub fn (mut app App) stats228(mut ctx Context) veb.Result {
	if app.stats_traffic == unsafe { nil } {
		ctx.res.set_status(.service_unavailable)
		return ctx.html('<!doctype html><title>Traffic statistics unavailable</title><p>Traffic statistics are disabled for this local server.</p>')
	}
	return ctx.html(app.stats_traffic.stats_html(ctx.req.url, traffic.PageConfig{
		site_name:  'V'
		page_title: 'V traffic statistics'
		home_url:   '/'
		stats_path: '/stats228'
	}))
}

fn (mut app App) record_home_visit(ctx Context) {
	if app.traffic == unsafe { nil } {
		return
	}
	// Veb serves requests concurrently, while each tracker owns one PostgreSQL
	// connection. Traffic collection must never hold up page delivery.
	if !app.traffic_lock.try_lock() {
		return
	}
	defer {
		app.traffic_lock.unlock()
	}
	app.traffic.record(traffic.Request{
		url:        ctx.req.url
		referer:    ctx.get_header(.referer) or { '' }
		user_agent: ctx.req.header.get(.user_agent) or { '' }
		country:    ctx.get_custom_header('CF-IPCountry') or { '' }
	}) or { eprintln('Could not record page visit: ${err}') }
}

pub fn (mut ctx Context) set_lang() {
	ctx.lang = Lang.from_string(ctx.get_cookie('lang') or { 'en' }) or { Lang.en }
}

fn build_tr_menu(cur_lang Lang) string {
	// mut sb := strings.new_builder()
	// sb.write_string('<select>')
	// TODO loop when >2 langs
	s := '<select id=select_lang>' +
		'<option value=en ${if cur_lang == .en { 'selected' } else { '' }}>EN</option>' +
		'<option value=ru ${if cur_lang == .ru { 'selected' } else { '' }}>РУ</option></select>'
	/*
	s := match cur_lang {
		.ru { 'English' }
		.en { 'Русский' }
	}
	*/
	return s
}

@['/change_lang/:lang'; post]
pub fn (mut app App) change_lang(mut ctx Context, lang string) veb.Result {
	selected_lang := Lang.from_string(lang) or {
		ctx.res.set_status(.bad_request)
		return ctx.json('Unsupported language')
	}
	expire_date := time.now().add_days(400)
	ctx.set_cookie(
		name:      'lang'
		value:     selected_lang.str()
		path:      '/'
		expires:   expire_date
		same_site: .same_site_lax_mode
	)
	// return ctx.redirect('/')
	return ctx.json('ok')
}
