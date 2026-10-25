"""Sphinx configuration for iFixedX — https://docs.liveandletdev.com"""

from datetime import date

project = "iFixedX"
author = "liveandletdev"
copyright = f"{date.today().year}, {author}"

html_title = "iFixedX documentation"
html_short_title = "iFixedX docs"

# Production site (GoDaddy subdomain → static _build/html)
html_baseurl = "https://docs.liveandletdev.com/"

extensions = [
    "myst_parser",
    "sphinx_design",
    "sphinx_copybutton",
    "sphinx_sitemap",
]

source_suffix = {
    ".md": "myst",
    ".rst": "restructuredtext",
}

root_doc = "index"
master_doc = "index"

templates_path = ["_templates"]
html_static_path = ["_static"]
html_css_files = ["custom.css"]

html_theme = "furo"
html_theme_options = {
    "source_repository": "https://github.com/liveandletdev/ifixedx",
    "source_branch": "main",
    "source_directory": "docs/",
    "sidebar_hide_name": False,
    "top_of_page_buttons": ["view", "edit"],
    "light_css_variables": {
        "color-brand-primary": "#1d9bf0",
        "color-brand-content": "#1d9bf0",
    },
    "dark_css_variables": {
        "color-brand-primary": "#1d9bf0",
        "color-brand-content": "#1d9bf0",
    },
}

myst_enable_extensions = [
    "colon_fence",
    "deflist",
]

myst_heading_anchors = 3

exclude_patterns = [
    "_build",
    ".venv",
    ".sphinx",
    "Thumbs.db",
    ".DS_Store",
]

sitemap_url_scheme = "{link}"
sitemap_excludes = ["genindex.html", "search.html"]

pygments_style = "sphinx"
