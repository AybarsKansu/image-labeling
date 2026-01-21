"""
File I/O utilities.
Path management and file operations.
"""

import re
from pathlib import Path
from typing import Optional


def safe_filename(name: str, default_ext: str = ".jpg") -> tuple[str, str]:
    """
    Sanitizes a filename for safe filesystem operations.
    
    Args:
        name: Original filename or path
        default_ext: Extension to use if none provided
        
    Returns:
        Tuple of (basename without extension, extension)
    """
    path = Path(name)
    stem = path.stem
    ext = path.suffix or default_ext
    
    # Remove any path traversal or dangerous characters
    stem = re.sub(r'[^\w\-_.]', '_', stem)
    
    return stem, ext


def ensure_directory(path: Path) -> Path:
    """
    Ensures a directory exists, creating it if necessary.
    
    Args:
        path: Directory path
        
    Returns:
        The same path (for chaining)
    """
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_next_version_name(
    pattern: str, 
    directory: Path, 
    prefix: str = "custom_v",
    suffix: str = ".pt"
) -> str:
    """
    Generates the next versioned filename (e.g., custom_v1.pt -> custom_v2.pt).
    
    Args:
        pattern: Glob pattern to find existing files
        directory: Directory to search in
        prefix: Version prefix
        suffix: File extension
        
    Returns:
        New versioned filename
    """
    import glob
    
    existing = glob.glob(str(directory / pattern))
    max_v = 0
    
    for f in existing:
        try:
            name = Path(f).stem
            v_str = name.replace(prefix.rstrip('_'), "").lstrip('_v')
            v = int(v_str)
            if v > max_v:
                max_v = v
        except (ValueError, AttributeError):
            pass
    
    return f"{prefix}{max_v + 1}{suffix}"
