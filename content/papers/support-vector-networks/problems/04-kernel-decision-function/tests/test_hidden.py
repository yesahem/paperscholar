import numpy as np
from solution import decision_function


def test_returns_one_score_per_point():
    result = decision_function(np.ones(2), np.array([1.0, -1.0]), np.eye(2), 0.0, np.ones((5, 2)), 2)
    assert result.shape == (5,), "the result should have one score per row of X"


def test_labels_flip_the_contribution():
    support = np.array([[1.0, 1.0]])
    point = np.array([[1.0, 1.0]])
    positive = decision_function(np.array([2.0]), np.array([1.0]), support, 0.0, point, 2)
    negative = decision_function(np.array([2.0]), np.array([-1.0]), support, 0.0, point, 2)
    assert np.allclose(positive, -negative), "changing a label's sign should flip its contribution"


def test_matches_a_loop_on_random_data():
    rng = np.random.default_rng(21)
    support, points = rng.normal(size=(6, 3)), rng.normal(size=(4, 3))
    alphas, labels = rng.random(6), np.where(rng.random(6) < 0.5, -1.0, 1.0)
    expected = [
        sum(a * yi * (float(s @ x) + 1.0) ** 3 for a, yi, s in zip(alphas, labels, support)) + 0.4
        for x in points
    ]
    result = decision_function(alphas, labels, support, 0.4, points, 3)
    assert np.allclose(result, expected), "scores should match a sum over the support vectors"


def test_classifies_a_problem_no_line_can_separate():
    support = np.array([[1.0, 1.0], [-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0]])
    labels = np.array([1.0, 1.0, -1.0, -1.0])
    scores = decision_function(np.full(4, 0.125), labels, support, 0.0, support, 2)
    assert np.array_equal(np.sign(scores), labels), "a degree-2 kernel should separate this XOR pattern"
