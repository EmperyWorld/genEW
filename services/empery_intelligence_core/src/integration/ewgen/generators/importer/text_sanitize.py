"""
Fortune Seaker - Unicode text sanitization for import bundles
"""

from typing import Any, Dict, List


def sanitize_unicode_text(text: str) -> str:
    """
    Remove lone surrogate code points that break UTF-8 JSON serialization.
    """
    if not text:
        return text
    return text.encode("utf-8", errors="surrogatepass").decode("utf-8", errors="replace")


def sanitize_file_entries(files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Sanitize file content fields in import file entries.
    """
    sanitized: List[Dict[str, Any]] = []
    for item in files:
        entry = dict(item)
        content = entry.get("content")
        if isinstance(content, str):
            entry["content"] = sanitize_unicode_text(content)
        sanitized.append(entry)
    return sanitized


def summarize_prepared_files(files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Return lightweight file metadata without content for API responses.
    """
    return [
        {
            "path": str(file.get("path", "")),
            "language": str(file.get("language", "")),
            "description": str(file.get("description", "")),
        }
        for file in files
    ]
