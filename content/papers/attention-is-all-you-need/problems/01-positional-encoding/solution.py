import numpy as np


def positional_encoding(seq_len: int, d_model: int) -> np.ndarray:
    positions = np.arange(seq_len)[:, None]
    pair_index = np.arange(0, d_model, 2)
    angles = positions / np.power(10000.0, pair_index / d_model)
    encoding = np.empty((seq_len, d_model))
    encoding[:, 0::2] = np.sin(angles)
    encoding[:, 1::2] = np.cos(angles)
    return encoding
