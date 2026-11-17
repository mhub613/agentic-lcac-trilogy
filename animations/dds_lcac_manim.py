"""
Manim Mathematical Animation Suite for DDS + LCAC (2012 Carleton Master's Thesis)
Author: Muhuji Mshana

Renders 3Blue1Brown-style vector mathematical animations of:
  1. UDGTiledNetworkScene       : 4-Tile Unit Disk Graph G(V,E) & Secondary Network G_D(V_GD, E_GD)
  2. DDSTreeConstructionScene   : Algorithm 4.1 O(N^2) Dynamic Dominating Set & Role Rotation
  3. DualSemaphoreCollisionScene: Algorithm 5.2 (Figures 5 & 6) Semaphore Mutex & O(N) LCAC Aggregation

Usage:
  pip install manim
  manim -pqh animations/dds_lcac_manim.py UDGTiledNetworkScene
  manim -pqh animations/dds_lcac_manim.py DDSTreeConstructionScene
  manim -pqh animations/dds_lcac_manim.py DualSemaphoreCollisionScene
"""

from manim import *
import numpy as np


class UDGTiledNetworkScene(Scene):
    """Scene 1: Animates Definition 3 (Unit Disk Graph) and Figure 4 (4-Tile Network Plane)."""

    def construct(self):
        title = Text("Two-Tier Tiled WSN Model: G(V, E) & G_D(V_GD, E_GD)", font_size=30, weight=BOLD)
        subtitle = Text("Muhuji Mshana (Carleton University, 2012) — Chapter 4.1", font_size=18, color=GRAY_B)
        subtitle.next_to(title, DOWN, buff=0.15)
        header = VGroup(title, subtitle).to_edge(UP, buff=0.3)
        self.play(Write(title), FadeIn(subtitle))

        # Draw 2x2 Tile Grid
        grid_size = 5.2
        half = grid_size / 2
        outer_box = Square(side_length=grid_size, color=BLUE_D, stroke_width=2.5).shift(DOWN * 0.35)
        v_line = Line(outer_box.get_top(), outer_box.get_bottom(), color=BLUE_D, stroke_width=1.5)
        h_line = Line(outer_box.get_left(), outer_box.get_right(), color=BLUE_D, stroke_width=1.5)

        t_labels = VGroup(
            Text("Tile T1", font_size=14, color=GRAY_C).move_to(outer_box.get_corner(UL) + RIGHT * 0.55 + DOWN * 0.25),
            Text("Tile T2", font_size=14, color=GRAY_C).move_to(outer_box.get_corner(UR) + LEFT * 0.55 + DOWN * 0.25),
            Text("Tile T3", font_size=14, color=GRAY_C).move_to(outer_box.get_corner(DL) + RIGHT * 0.55 + UP * 0.25),
            Text("Tile T4", font_size=14, color=GRAY_C).move_to(outer_box.get_corner(DR) + LEFT * 0.55 + UP * 0.25),
        )
        self.play(Create(outer_box), Create(v_line), Create(h_line), FadeIn(t_labels))

        # Global Sink at center (0,0) of grid
        center_pt = outer_box.get_center()
        global_sink = Dot(center_pt, radius=0.16, color=GREEN)
        gs_label = Text("Global Sink v_0", font_size=15, color=GREEN).next_to(global_sink, DOWN, buff=0.12)

        # Sample nodes in Tile T2 (top-right quadrant)
        np.random.seed(12)
        t2_center = center_pt + RIGHT * (half / 2) + UP * (half / 2)
        offsets = [
            np.array([0.0, 0.0, 0.0]),
            np.array([-0.65, 0.45, 0.0]),
            np.array([0.6, 0.5, 0.0]),
            np.array([0.55, -0.45, 0.0]),
            np.array([-0.5, -0.5, 0.0]),
            np.array([-0.9, 0.85, 0.0]),
            np.array([0.9, 0.8, 0.0]),
        ]
        dots = VGroup(*[Dot(t2_center + off, radius=0.08, color=YELLOW) for off in offsets])
        self.play(FadeIn(global_sink), Write(gs_label), LaggedStart(*[GrowFromCenter(d) for d in dots], lag_ratio=0.1))

        # Show Unit Disk Graph radius r around center node in T2
        udg_circle = Circle(radius=0.95, color=TEAL_A, stroke_width=1.8, fill_opacity=0.12).move_to(t2_center)
        udg_tex = MathTex(r"\text{UDG: } \text{dist}(p, q) \le r \implies e(p,q) \in E", font_size=24, color=TEAL_A)
        udg_tex.to_edge(DOWN, buff=0.25)
        self.play(Create(udg_circle), Write(udg_tex))

        # Promote Dominants (Blue) and Tile Sink (Orange)
        edges = VGroup(
            Line(dots[1].get_center(), dots[0].get_center(), color=BLUE_B),
            Line(dots[2].get_center(), dots[0].get_center(), color=BLUE_B),
            Line(dots[3].get_center(), dots[0].get_center(), color=YELLOW_D),
            Line(dots[4].get_center(), dots[0].get_center(), color=YELLOW_D),
            Line(dots[5].get_center(), dots[1].get_center(), color=YELLOW_D),
            Line(dots[6].get_center(), dots[2].get_center(), color=YELLOW_D),
            Arrow(dots[0].get_center(), global_sink.get_center(), buff=0.15, color=ORANGE, stroke_width=3),
        )
        self.play(
            dots[0].animate.set_color(ORANGE).scale(1.4),
            dots[1].animate.set_color(BLUE_B).scale(1.2),
            dots[2].animate.set_color(BLUE_B).scale(1.2),
            Create(edges),
        )
        self.wait(2)


class DualSemaphoreCollisionScene(Scene):
    """Scene 3: Animates Algorithm 5.2 (Figures 5 & 6) Dual Semaphore Collision Avoidance."""

    def construct(self):
        title = Text("Algorithm 5.2: Dual Semaphore Local Collision Model (LCAC)", font_size=28, weight=BOLD)
        title.to_edge(UP, buff=0.35)
        self.play(Write(title))

        # Parent node A (Blue Dominant) and two child leaf nodes B and C (Yellow)
        node_A = Dot(UP * 1.1, radius=0.16, color=BLUE_B)
        lbl_A = Text("Parent A (Dominant)", font_size=16, color=BLUE_B).next_to(node_A, UP, buff=0.15)

        node_B = Dot(LEFT * 1.8 + DOWN * 1.2, radius=0.13, color=YELLOW)
        lbl_B = Text("Child B", font_size=16, color=YELLOW).next_to(node_B, DOWN, buff=0.15)

        node_C = Dot(RIGHT * 1.8 + DOWN * 1.2, radius=0.13, color=YELLOW)
        lbl_C = Text("Child C", font_size=16, color=YELLOW).next_to(node_C, DOWN, buff=0.15)

        link_BA = DashedLine(node_B.get_center(), node_A.get_center(), color=GRAY)
        link_CA = DashedLine(node_C.get_center(), node_A.get_center(), color=GRAY)

        self.play(
            FadeIn(node_A), Write(lbl_A),
            FadeIn(node_B), Write(lbl_B),
            FadeIn(node_C), Write(lbl_C),
            Create(link_BA), Create(link_CA)
        )

        rule_tex = MathTex(
            r"\texttt{local\_semaphore} == \text{False} \;\land\; \texttt{parent\_semaphore}(A) == \text{False}",
            font_size=26, color=GREEN_B
        ).to_edge(DOWN, buff=0.4)
        self.play(Write(rule_tex))

        # Child B locks semaphore; Child C gets red hold ring
        lock_ring_C = Circle(radius=0.35, color=RED, stroke_width=3).move_to(node_C.get_center())
        wait_lbl_C = Text("WAIT (parent_semaphore = True)", font_size=14, color=RED).next_to(lock_ring_C, RIGHT, buff=0.15)

        pkt_B = Dot(node_B.get_center(), radius=0.09, color=GREEN_A)
        self.play(Create(lock_ring_C), FadeIn(wait_lbl_C))
        self.play(MoveAlongPath(pkt_B, Line(node_B.get_center(), node_A.get_center())), run_time=1.2)
        self.play(FadeOut(pkt_B))

        # Release semaphore and allow C to transmit
        self.play(FadeOut(lock_ring_C), FadeOut(wait_lbl_C))
        pkt_C = Dot(node_C.get_center(), radius=0.09, color=GREEN_A)
        self.play(MoveAlongPath(pkt_C, Line(node_C.get_center(), node_A.get_center())), run_time=1.2)
        self.play(FadeOut(pkt_C), node_A.animate.scale(1.25).set_color(TEAL_A))
        self.wait(2)
