<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// The package's designer routes guard with the plain `auth` middleware, whose
// guest redirect targets a route named `login`. The workbench has no app-level
// auth scaffolding — Filament owns login — so alias the name to the panel's
// login page. Without this, an expired session on /survey-designer/* throws
// "Route [login] not defined" (500) instead of redirecting to sign-in.
Route::redirect('/login', '/admin/login')->name('login');
