import numpy as np


def positional_encoding(seq_len: int, d_model: int) -> np.ndarray:
    """Sinusoidal positional encoding, shape (seq_len, d_model).

    PE[pos, 2i] = sin(pos / 10000 ** (2i / d_model)); PE[pos, 2i + 1] = cos(same angle).
    Positions start at 0. d_model is even.
    """
    raise NotImplementedError
